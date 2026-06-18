# Plan 001: Sanitize API-derived IDs before trace file writes

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eccfd5f..HEAD -- src/lib/trace.ts`
> If `src/lib/trace.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `eccfd5f`, 2026-06-18

## Why this matters

`src/lib/trace.ts` writes session/workflow trace files to a directory path built
by joining a base trace dir with an **ID that comes straight from an API
response** (`session.sessionId`, the workflow `instanceId`). Nothing validates
that ID. If the API response is malicious or tampered with in transit, an ID
containing `../` (or an absolute path) makes `join()` escape the intended trace
directory and write `trace.json` / `summary.md` to an attacker-chosen location in
the user's filesystem. This is a classic path-traversal sink. The fix is small
and purely defensive: constrain the ID to a single path segment before it ever
reaches `join()`.

## Current state

- `src/lib/trace.ts` — managed-session trace writer. The low-level writer joins
  the trace dir with a caller-supplied `id`:

  ```ts
  // src/lib/trace.ts:147-159
  /** Low-level writer. `traceDir` must already be resolved (see resolveTraceDir). */
  export function writeTrace(opts: {
    traceDir: string;
    id: string;
    record: unknown;
    summaryMarkdown: string;
  }): string {
    const dir = join(opts.traceDir, opts.id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "trace.json"), JSON.stringify(opts.record, null, 2) + "\n");
    writeFileSync(join(dir, "summary.md"), opts.summaryMarkdown);
    return dir;
  }
  ```

- The two callers pass **API-controlled** values as `id`:

  ```ts
  // src/lib/trace.ts:161-181
  export function writeSessionTrace(session: Session, explicitDir?: string): string {
    return writeTrace({
      traceDir: resolveTraceDir(explicitDir),
      id: session.sessionId, // ← from API response
      record: session,
      summaryMarkdown: buildSessionSummaryMarkdown(session),
    });
  }

  export function writeBatchOverviewTrace(
    status: BatchOverviewStatusResponse,
    instanceId: string, // ← from API response
    explicitDir?: string,
  ): string {
    return writeTrace({
      traceDir: resolveTraceDir(explicitDir),
      id: instanceId,
      record: status,
      summaryMarkdown: buildBatchOverviewSummaryMarkdown(status, instanceId),
    });
  }
  ```

- Existing imports at the top of the file:

  ```ts
  // src/lib/trace.ts:1-2
  import { mkdirSync, writeFileSync } from "node:fs";
  import { join } from "node:path";
  ```

- **Convention to follow**: the repo keeps pure, testable helpers in `src/lib/`
  with co-located unit tests in `tests/unit/`. There is already
  `tests/unit/trace.test.ts`. Add the new test cases there.

## Commands you will need

| Purpose   | Command                             | Expected on success |
| --------- | ----------------------------------- | ------------------- |
| Typecheck | `bun run typecheck`                 | exit 0, no errors   |
| Tests     | `bun test tests/unit/trace.test.ts` | all pass            |
| Lint      | `bun run lint`                      | exit 0              |

## Scope

**In scope** (the only files you should modify):

- `src/lib/trace.ts`
- `tests/unit/trace.test.ts`

**Out of scope** (do NOT touch):

- `src/api/client.ts` and any command file — the fix belongs at the write sink,
  not at every call site.
- The shape of `Session` / `BatchOverviewStatusResponse` types.
- `resolveTraceDir` — the base-dir resolution is fine; only the `id` segment is
  untrusted.

## Git workflow

- Branch: `advisor/001-sanitize-trace-id-path`
- Commit style: conventional commits (repo uses them — e.g.
  `fix(import): dedup org accounts ...`). Suggested message:
  `fix(trace): constrain API-derived trace id to a single path segment`
- Do NOT push or open a PR unless the operator instructed it.
- A user-visible behavior guard like this warrants a changeset: add a `patch`
  changeset under `.changeset/` (copy the header — the eight fixed-group
  packages — from any existing `.changeset/*.md` in git history).

## Steps

### Step 1: Add a path-segment sanitizer in trace.ts

In `src/lib/trace.ts`, add a small helper above `writeTrace` that reduces any
input to a safe single path segment. Use `node:path`'s `basename` to strip
directory components, then reject anything that still isn't a plain segment.

Target shape:

```ts
import { basename, join } from "node:path"; // extend the existing import

/**
 * Trace IDs come from API responses (session/instance IDs). Constrain them to a
 * single safe path segment so a malicious or tampered response can't traverse
 * out of the trace dir (`../`, absolute paths, separators). Fail closed: an
 * unusable id throws rather than writing to an unexpected location.
 */
function safeTraceSegment(id: string): string {
  const seg = basename(id);
  if (!seg || seg === "." || seg === ".." || /[/\\]/.test(seg)) {
    throw new Error(`Unsafe trace id: ${JSON.stringify(id)}`);
  }
  return seg;
}
```

Then use it in `writeTrace`:

```ts
const dir = join(opts.traceDir, safeTraceSegment(opts.id));
```

Note: the file currently imports only `join` from `node:path` (line 2). Update
that import to include `basename`.

**Verify**: `bun run typecheck` → exit 0, no errors.

### Step 2: Add unit tests for the sanitizer behavior

In `tests/unit/trace.test.ts`, add a `describe` block covering `writeTrace`'s
path handling. Cover:

- **Happy path**: a normal id like `"sess_abc123"` writes `trace.json` and
  `summary.md` under `<traceDir>/sess_abc123/` and returns that dir. Use a temp
  dir (`mkdtempSync(join(tmpdir(), ...))`) — see `tests/unit/api-client.test.ts`
  lines 1-5 for the `mkdtempSync`/`tmpdir`/`rmSync` import pattern.
- **Traversal rejected**: `id: "../escape"` throws (`expect(() =>
writeTrace({...})).toThrow(/Unsafe trace id/)`) and writes nothing outside the
  temp dir.
- **Separator rejected**: `id: "a/b"` throws.
- **Absolute path rejected**: `id: "/etc/evil"` throws.

**Verify**: `bun test tests/unit/trace.test.ts` → all pass, including the 4 new
cases.

### Step 3: Final checks

**Verify**:

- `bun run lint` → exit 0
- `git status --porcelain` → only `src/lib/trace.ts`, `tests/unit/trace.test.ts`,
  and one new `.changeset/*.md` listed.

## Test plan

- New tests in `tests/unit/trace.test.ts`: happy-path write, plus three traversal
  rejections (`../escape`, `a/b`, `/etc/evil`).
- Structural pattern: model the temp-dir setup on `tests/unit/api-client.test.ts`
  (top-of-file `mkdtempSync`/`rmSync`/`tmpdir`/`join` imports).
- Verification: `bun test tests/unit/trace.test.ts` → all pass.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test tests/unit/trace.test.ts` passes with ≥4 new assertions
- [ ] `grep -n "safeTraceSegment" src/lib/trace.ts` shows the helper is used in
      `writeTrace`
- [ ] No files outside the in-scope list modified (`git status`)
- [ ] A `patch` changeset exists under `.changeset/`
- [ ] `plans/README.md` status row updated to DONE

## STOP conditions

Stop and report (do not improvise) if:

- `src/lib/trace.ts` no longer matches the "Current state" excerpts (drift).
- `writeTrace` is already sanitizing its `id` — then this is already fixed; mark
  the plan REJECTED in `plans/README.md` with that note.
- A legitimate session/instance ID format in the codebase actually contains `/`
  (search `tests/` and types for `sessionId`/`instanceId` examples). If real IDs
  can contain separators, the `basename`-only approach would corrupt them — stop
  and report so the sanitizer can be adjusted.

## Maintenance notes

- Any future `writeTrace`-like helper that builds a path from API data must reuse
  `safeTraceSegment` (or an equivalent). Reviewers: watch for new `join(dir,
apiValue)` sinks.
- Deferred: this does not add traversal protection to `resolveTraceDir`'s
  `--trace-dir` value, because that is operator-supplied (the user choosing where
  their own traces go), not API-controlled — a different trust level.
