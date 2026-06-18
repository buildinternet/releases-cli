# Plan 005: Characterization tests for untested client.ts functions

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eccfd5f..HEAD -- src/api/client.ts tests/unit/api-client.test.ts`
> If these changed, re-derive the untested-function list (Step 1) against the live
> code before proceeding.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `eccfd5f`, 2026-06-18

## Why this matters

`src/api/client.ts` is the CLI's single HTTP boundary — 2455 lines, ~40 exported
functions — and it is the dependency of every command. Its existing test file
(`tests/unit/api-client.test.ts`) covers a fraction of that surface: `apiFetch`
404 behavior, `findSource`/`findOrg`/`findProduct` resolution, list helpers. Many
mutating and read functions have **zero** coverage. That gap is the single
biggest blocker to safely improving this file (see Plan 006, the god-module
split, which depends on this one): you cannot refactor request-building code with
confidence when nothing pins down the URLs, methods, and bodies it produces.

These are **characterization tests**: they lock in the _current_ observable
behavior (the exact path, HTTP method, query string, and request body each
function sends, and how it parses the response), so a later refactor that changes
any of those breaks a test loudly. They are pure wins — isolated, fast, no side
effects — and unlock 006.

## Current state

- `src/api/client.ts` — the module under test. `apiFetch<T>(path, opts?)` is the
  shared primitive; every exported function calls it with a path and (for
  mutations) a `method` + JSON `body`.

- `tests/unit/api-client.test.ts` — the existing test file and the pattern to
  extend. Key infrastructure already present:

  ```ts
  // tests/unit/api-client.test.ts:14-36
  // env drives real mode.ts (no module mock — those are process-global and leak)
  beforeAll(() => {
    process.env.RELEASES_API_URL = "https://test.example.com";
    process.env.RELEASES_API_KEY = "test-key";
  });
  // ...
  const client = await import("../../src/api/client.js");

  function mockFetch(status: number, body: unknown = null) {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      })) as any;
  }
  ```

  Tests swap `globalThis.fetch` per test and restore it in `afterEach` (lines
  43-51). **To assert on the request** (path/method/body), capture the args:
  replace `globalThis.fetch` with a spy that records `(url, init)` then returns a
  canned `Response`. Example shape to use:

  ```ts
  function captureFetch(status: number, body: unknown = null) {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;
    return calls;
  }
  ```

- **Important repo testing note** (from `AGENTS.md` / the file header comment):
  do NOT use `mock.module()` for `mode.js` — it is process-global and leaks
  across files. Drive behavior via env, exactly as the existing file does.

- **Convention**: unit tests live in `tests/unit/`, run with `bun test`. The
  whole suite is run with `bun run test` (the root script), but during
  development target the one file.

## Commands you will need

| Purpose      | Command                                                                 | Expected on success    |
| ------------ | ----------------------------------------------------------------------- | ---------------------- |
| Typecheck    | `bun run typecheck`                                                     | exit 0                 |
| Target tests | `bun test tests/unit/api-client.test.ts`                                | all pass               |
| Full suite   | `bun run test`                                                          | all pass               |
| Lint         | `bun run lint`                                                          | exit 0                 |
| List exports | `grep -nE "^export (async )?function" src/api/client.ts`                | the function inventory |
| List tested  | `grep -oE "client\.[a-zA-Z]+" tests/unit/api-client.test.ts \| sort -u` | what's already covered |

## Scope

**In scope**:

- `tests/unit/api-client.test.ts` (extend) — OR a new sibling file
  `tests/unit/api-client-mutations.test.ts` if the existing file grows unwieldy
  (>~1000 lines). Either is fine; prefer extending unless it gets large.

**Out of scope**:

- `src/api/client.ts` itself — **do not change production code in this plan.**
  These tests characterize existing behavior. If a test reveals an actual bug
  (e.g. a wrong path), do NOT fix it here — record it and write the test to
  assert the _current_ (buggy) behavior with a `// FIXME(advisor): wrong path?`
  comment, or skip that one function and report it. (Bug fixes are separate
  plans — see 002.)
- Any other test file.

## Git workflow

- Branch: `advisor/005-client-characterization-tests`
- Commit: `test(client): characterization tests for untested client.ts functions`
- A test-only change still ships a `patch` changeset per repo policy if it's
  user-visible — tests are not user-visible, so a changeset is **optional** here;
  add one only if `bun run test` / CI complains about a missing changeset.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Derive the untested-function list

Run both inventory commands from the table:

```
grep -nE "^export (async )?function" src/api/client.ts
grep -oE "client\.[a-zA-Z]+" tests/unit/api-client.test.ts | sort -u
```

Subtract the second from the first. The audit identified these as having no
coverage (verify against your diff — names may have shifted):

- Embeddings: `embedReleases`, `embedEntities`, `embedChangelogs`,
  `getEmbedStatus`
- Backfill / re-extract: `backfillSource`, `reextractSource`, plus any
  `get*Status` for them
- Batch overview: `triggerBatchOverview`, `getBatchOverviewStatus`
- Media: `insertMediaAssets`, `queryReleasesWithMedia`
- Sessions: `listSessions`, `getSession`
- Admin roles / OAuth: `getUserRole`, `setUserRole`, `listUserRoles`,
  `createOAuthClient` (and sibling OAuth CRUD)
- Misc: `evaluateUrl`, `updateSourceMeta`, `getMonthlySummary` (if not covered by
  Plan 002)

Pick the **15–25 highest-value** untested functions, prioritizing: (a) mutations
(POST/PATCH/DELETE — wrong method/body is the costliest bug), (b) functions the
biggest command files depend on (`import.ts`, `org.ts`, `product.ts`,
`admin/overview.ts`). Write the chosen list into your final report.

### Step 2: Write one characterization test per chosen function

For each function, write a test that uses `captureFetch` (Step "Current state"
shape) and asserts the **request contract**:

- the URL path (use `expect(calls[0].url).toContain("/v1/...")` or match the full
  path after the test base `https://test.example.com`),
- the HTTP method (`expect(calls[0].init?.method).toBe("POST")`),
- the request body when applicable (`JSON.parse(calls[0].init!.body as string)`
  deep-equals the expected payload),
- the parsed return value for a representative success response.

Read each function's body in `src/api/client.ts` to get the _actual_ path,
method, and body shape — **do not guess**. The test asserts what the code does
today.

Group them in a `describe` per domain (e.g. `describe("embeddings")`,
`describe("admin roles")`) for readability.

**Verify after each group**: `bun test tests/unit/api-client.test.ts` → all pass.

### Step 3: Run the full suite

The root test script isolates `workers/api`-style concerns differently, but for
this client repo `bun run test` runs everything. Confirm no leakage (the env-based
approach should keep these tests hermetic).

**Verify**: `bun run test` → all pass; `bun run typecheck` → exit 0; `bun run lint` → exit 0.

## Test plan

- 15–25 new characterization tests in `tests/unit/api-client.test.ts` (or the new
  sibling file), each asserting path + method + body + parsed result for one
  previously-untested exported function.
- Structural pattern: the existing `describe` blocks and the `mockFetch` helper in
  `tests/unit/api-client.test.ts`; extend `mockFetch` to `captureFetch` to inspect
  requests.
- Verification: `bun run test` → all pass, with the new count visible in output.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` passes; ≥15 new tests for previously-untested client.ts
      functions exist
- [ ] Every chosen function asserts at least path + method (+ body for mutations)
- [ ] `src/api/client.ts` is unchanged (`git diff --stat eccfd5f..HEAD -- src/api/client.ts` shows no changes from this branch)
- [ ] No production files modified (`git status` shows only test files, maybe a
      changeset)
- [ ] `plans/README.md` status row updated; note this unblocks Plan 006

## STOP conditions

Stop and report if:

- The test infrastructure in `tests/unit/api-client.test.ts` no longer matches the
  "Current state" excerpts (drift) — re-read it and adapt, or stop if the
  env-driven approach has been replaced by something incompatible.
- A function's behavior can't be characterized without real network/auth (it
  doesn't route through `apiFetch`/`globalThis.fetch`) — skip it, note why.
- A test reveals an apparent production bug — write the test to current behavior
  with a `FIXME` and report it; do NOT fix `src/api/client.ts` in this plan.

## Maintenance notes

- These tests are the safety net for Plan 006 (splitting `client.ts`). After 006,
  the tests should still pass unchanged (a pure move shouldn't alter request
  contracts) — if 006 breaks them, that's the net doing its job.
- When new client functions are added, add a characterization test alongside —
  reviewers should treat an untested new `apiFetch` caller as incomplete.
