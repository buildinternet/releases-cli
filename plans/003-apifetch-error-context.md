# Plan 003: Wrap apiFetch transport errors with endpoint context

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eccfd5f..HEAD -- src/api/client.ts`
> If `src/api/client.ts` changed, compare "Current state" against live code; on
> mismatch, STOP.

## Status

- **Priority**: P3
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `eccfd5f`, 2026-06-18

## Why this matters

When the network fails (DNS failure, connection refused, abort), `apiFetch`
catches the transport error, records it to the mutation log, and re-throws the
**raw** error — a bare `ECONNREFUSED` with no indication of which endpoint or
operation failed. Every command surfaces that contextless message to the user.
Contrast the HTTP-error path two lines down, which already produces a rich
message (`API error (404) on POST /v1/...`). This plan brings the transport-error
path up to the same standard so field debugging doesn't require reading the
mutation log. It is a message-only change; control flow is unchanged.

## Current state

- `src/api/client.ts` — the transport-error catch re-throws the raw error:

  ```ts
  // src/api/client.ts:115-141 (abbreviated around the two error paths)
  let res: Response;
  try {
    res = await fetch(url, { ...opts, headers });
  } catch (err) {
    // Transport-level failure (DNS, connection refused, abort) — no response,
    // but the mutating attempt still belongs in the audit trail.
    if (logMutation) {
      recordMutation({
        method,
        path,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err; // ← raw, no endpoint context
  }

  if (res.status === 404 && (!opts?.method || opts.method === "GET")) return null as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = (body as { message?: string }).message ?? res.statusText;
    if (logMutation) {
      recordMutation({ method, path, ok: false, status: res.status, error: message });
    }
    throw new Error(`API error (${res.status}) on ${opts?.method ?? "GET"} ${path}: ${message}`);
  }
  ```

  Note the HTTP-error message format on the last line — match its style
  (`<verb> <path>`) in the transport-error path. `method` is `opts?.method ?? ""`
  earlier in the function; use `opts?.method ?? "GET"` in the message for
  consistency with the HTTP path.

- **Convention**: error messages are human-facing and printed to stderr via the
  logger. The existing HTTP-error message is the template to follow.

## Commands you will need

| Purpose   | Command                                  | Expected on success |
| --------- | ---------------------------------------- | ------------------- |
| Typecheck | `bun run typecheck`                      | exit 0              |
| Tests     | `bun test tests/unit/api-client.test.ts` | all pass            |
| Lint      | `bun run lint`                           | exit 0              |

## Scope

**In scope**:

- `src/api/client.ts` (the transport-error `catch` block only)
- `tests/unit/api-client.test.ts` (add a case)

**Out of scope**:

- The mutation-log call inside the catch — leave it exactly as is (it already
  logs the raw `err.message`, which is correct for the audit trail).
- The HTTP-error path and the 404 path — unchanged.
- Any change to error _types_ thrown elsewhere.

## Git workflow

- Branch: `advisor/003-apifetch-error-context`
- Commit: `fix(client): add endpoint context to apiFetch transport errors`
- Add a `patch` changeset.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Wrap the re-thrown transport error

Replace `throw err;` in the transport-error catch with a wrapped error that
preserves the original via `cause` (supported by Bun/Node) and includes the
verb + path, matching the HTTP-error message shape:

```ts
const detail = err instanceof Error ? err.message : String(err);
throw new Error(`API request failed on ${opts?.method ?? "GET"} ${path}: ${detail}`, {
  cause: err,
});
```

Keep the `recordMutation({ ... })` call above it unchanged.

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Add a test for the wrapped message

In `tests/unit/api-client.test.ts`, add a case that forces `fetch` to reject and
asserts the thrown message contains the endpoint. The file already swaps
`globalThis.fetch` per test (see the `beforeEach`/`afterEach` saving
`originalFetch` around line 43-51); follow that pattern:

```ts
it("wraps transport errors with endpoint context", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("ECONNREFUSED");
  }) as any;
  try {
    await expect(client.findSource("anything")).rejects.toThrow(
      /API request failed on GET .*: ECONNREFUSED/,
    );
  } finally {
    globalThis.fetch = original;
  }
});
```

(Use whichever exported GET function is simplest; `findSource` performs a GET.)

**Verify**: `bun test tests/unit/api-client.test.ts` → all pass including the new
case.

### Step 3: Final checks

**Verify**:

- `bun run lint` → exit 0
- `git status --porcelain` → only `src/api/client.ts`,
  `tests/unit/api-client.test.ts`, one `.changeset/*.md`.

## Test plan

- New test in `tests/unit/api-client.test.ts`: a rejected `fetch` yields an error
  whose message contains `API request failed on GET <path>` and the original
  detail.
- Pattern: the `globalThis.fetch` swap used throughout that file.
- Verification: `bun test tests/unit/api-client.test.ts` → all pass.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test tests/unit/api-client.test.ts` passes with the new case
- [ ] `grep -n "throw err;" src/api/client.ts` no longer matches inside the
      transport catch (it's now a wrapped `new Error`)
- [ ] No files outside the in-scope list modified
- [ ] A `patch` changeset exists
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- The transport-error catch block no longer matches the "Current state" excerpt
  (drift), or it already wraps the error with context (already fixed → mark
  REJECTED).
- Any existing test asserts on the _raw_ transport-error message and breaks —
  report it; the assertion may need updating, which is a judgment call for the
  reviewer.

## Maintenance notes

- `cause` preserves the original error for anything that inspects error chains;
  keep it when touching this path.
- Reviewer: confirm the message does not interpolate any header/auth value —
  only `method` and `path`, both non-secret. (`path` never contains the bearer
  token; that lives in headers.)
