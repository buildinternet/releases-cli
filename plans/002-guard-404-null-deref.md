# Plan 002: Guard 404-nullable fetch results against null deref

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eccfd5f..HEAD -- src/api/client.ts`
> If `src/api/client.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code; on a mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `eccfd5f`, 2026-06-18

## Why this matters

`apiFetch` returns `null` (cast to `T`) on a GET that 404s. Most callers handle
that, but `getMonthlySummary` indexes the result with `rows[0]` without a null
check. On a 404 from the summaries endpoint, `rows` is `null` and `rows[0]`
throws `TypeError: Cannot read properties of null` instead of cleanly returning
"no summary." The function's declared return type is already
`Promise<ReleaseSummary | undefined>`, so returning `undefined` on a miss is the
intended contract — the code just doesn't honor it. This plan fixes the one
confirmed site and adds a regression test.

## Current state

- `src/api/client.ts` — single HTTP boundary. `apiFetch` short-circuits GET 404s
  to `null`:

  ```ts
  // src/api/client.ts:134
  if (res.status === 404 && (!opts?.method || opts.method === "GET")) return null as T;
  ```

- The unguarded caller (the **only** `rows[0]` site in the file — verified by
  `grep -n "rows\[0\]" src/api/client.ts`):

  ```ts
  // src/api/client.ts:1944-1953
  export async function getMonthlySummary(
    sourceSlugOrId: string,
    year: number,
    month: number,
  ): Promise<ReleaseSummary | undefined> {
    const rows = await apiFetch<ReleaseSummary[]>(
      `/v1/sources/${encodeURIComponent(sourceSlugOrId)}/summaries?type=monthly&year=${year}&month=${month}`,
    );
    return rows[0]; // ← throws if rows is null (GET 404)
  }
  ```

- This function currently has **no callers inside the repo** (verified:
  `grep -rn "getMonthlySummary" src tests` shows only the definition), but it is
  exported and part of the client's public surface (e.g. usable from the MCP
  bridge), so the crash is reachable by consumers.

- **Convention to follow**: 404-as-null handling and its tests already exist —
  see `tests/unit/api-client.test.ts` `describe("apiFetch 404 handling")` (lines
  42-70), which uses a `mockFetch(status, body)` helper (lines 30-36) and asserts
  `findSource`/`findOrg` return `null` on GET 404. Match that test style.

## Commands you will need

| Purpose   | Command                                                  | Expected on success                        |
| --------- | -------------------------------------------------------- | ------------------------------------------ |
| Typecheck | `bun run typecheck`                                      | exit 0, no errors                          |
| Tests     | `bun test tests/unit/api-client.test.ts`                 | all pass                                   |
| Lint      | `bun run lint`                                           | exit 0                                     |
| Sweep     | `grep -nE "await apiFetch<[^>]+\[\]>" src/api/client.ts` | find array-returning fetches to spot-check |

## Scope

**In scope**:

- `src/api/client.ts` (the `getMonthlySummary` body only)
- `tests/unit/api-client.test.ts` (add cases)

**Out of scope**:

- `apiFetch` itself — its 404→null contract is deliberate and tested; do not
  change it.
- Any broad refactor of other functions. If the Step 2 sweep finds _additional_
  unguarded `null`-result derefs, list them in your report but do NOT fix them in
  this plan unless they are also a one-line `?.[0]` / `?? undefined` guard with an
  obvious correct return — see STOP conditions.

## Git workflow

- Branch: `advisor/002-guard-404-null-deref`
- Commit: `fix(client): return undefined from getMonthlySummary on 404 instead of throwing`
- Add a `patch` changeset (`.changeset/`, header copied from an existing one).
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Guard the deref

In `src/api/client.ts`, change the `getMonthlySummary` return from `rows[0]` to a
null-safe form that honors the `| undefined` return type:

```ts
return rows?.[0];
```

(`rows?.[0]` yields `undefined` when `rows` is `null`, matching the declared
return type.)

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Sweep for sibling null-deref sites (report-only)

Run:

```
grep -nE "await apiFetch<[^>]*\[\]>" src/api/client.ts
```

For each array-returning GET, check whether the immediately following code
indexes (`[0]`) or maps the result without a null guard. The audit found only
`getMonthlySummary`. If you find others that are also GETs (so `apiFetch` can
return null) AND the fix is an unambiguous one-liner (`?.[0]`, `?? []`), you MAY
apply it. If a fix is non-obvious (changes a return type, affects a tested
function), do NOT touch it — record it in your final report instead.

**Verify**: note in your report which sites you inspected and which (if any) you
guarded.

### Step 3: Add a regression test

In `tests/unit/api-client.test.ts`, add a test that `getMonthlySummary` returns
`undefined` (does not throw) on a GET 404, using the existing `mockFetch` helper:

```ts
it("returns undefined from getMonthlySummary on GET 404", async () => {
  mockFetch(404);
  const result = await client.getMonthlySummary("src_123", 2026, 6);
  expect(result).toBeUndefined();
});
```

Also add a happy-path case: `mockFetch(200, [{ /* minimal ReleaseSummary */ }])`
returns the first row. (Inspect the `ReleaseSummary` type in
`src/api/client.ts` / api-types to build a minimal valid object; if the shape is
large, a cast like `as any` in the test body is acceptable — the test asserts
the indexing behavior, not the shape.)

**Verify**: `bun test tests/unit/api-client.test.ts` → all pass, including the 2
new cases.

### Step 4: Final checks

**Verify**:

- `bun run lint` → exit 0
- `git status --porcelain` → only `src/api/client.ts`,
  `tests/unit/api-client.test.ts`, and one `.changeset/*.md`.

## Test plan

- New tests in `tests/unit/api-client.test.ts`: `getMonthlySummary` returns
  `undefined` on GET 404 (the regression), and returns the first row on 200.
- Pattern: model on the existing `describe("apiFetch 404 handling")` block (lines
  42-70) and the `mockFetch` helper (lines 30-36).
- Verification: `bun test tests/unit/api-client.test.ts` → all pass.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `grep -n "rows\[0\]" src/api/client.ts` returns no matches (the unguarded
      form is gone)
- [ ] `bun test tests/unit/api-client.test.ts` passes with the 2 new cases
- [ ] No files outside the in-scope list modified
- [ ] A `patch` changeset exists
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The "Current state" excerpt for `getMonthlySummary` no longer matches (drift).
- The Step 2 sweep surfaces a null-deref whose fix would change a function's
  return type or behavior beyond a trivial guard — report it, don't fix it here.
- A new test reveals `apiFetch` no longer returns `null` on GET 404 (the contract
  changed) — then the whole premise shifted; stop.

## Maintenance notes

- The root cause is a typed footgun: `apiFetch<T>` lies about returning `T` when
  it can return `null`. A larger follow-up (out of scope here) would be to type
  array-returning GETs as `T | null` so the compiler forces the guard. Reviewers:
  any new `await apiFetch<X[]>(...)` followed by `[0]`/`.map` without `?.` is the
  same bug.
