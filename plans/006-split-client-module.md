# Plan 006: Split src/api/client.ts into domain modules

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report — do not improvise. This
> is a HIGH-risk refactor; the per-step verification gates are mandatory. When
> done, update the status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eccfd5f..HEAD -- src/api/client.ts`
> This plan assumes `src/api/client.ts` is ~2455 lines. If it has been
> substantially restructured since `eccfd5f`, STOP and report — the split strategy
> needs re-planning.

## Status

- **Priority**: P3
- **Effort**: L
- **Risk**: HIGH
- **Depends on**: `plans/005-client-characterization-tests.md` (MUST be DONE first)
- **Category**: tech-debt
- **Planned at**: commit `eccfd5f`, 2026-06-18

## Why this matters

`src/api/client.ts` is a 2455-line god module — 10× the repo's median file. It
bundles unrelated responsibilities: the `apiFetch` primitive, identifier
resolution (`findSource`/`findProduct`/resolvers), and full CRUD for ~10 entity
families (sources, orgs, products, releases, collections, follows, webhooks,
OAuth clients, tags, sessions, plus admin roles, embeddings, backfill, media).
Every command imports from it, so any change to low-level plumbing means reading
2.4K lines, and review/merge friction is high. Splitting it into cohesive
per-domain modules behind a barrel makes the code navigable and changes
localized. The split is **mechanical** (move functions, don't change them) — its
risk is entirely about not breaking the ~80 import sites, which is why Plan 005's
characterization tests are a hard prerequisite.

## Current state

- `src/api/client.ts` — one module, ~2455 lines. Functions are loosely grouped by
  comment banners (e.g. `// ── Overview / Playbook Pages ──` at the
  `getMonthlySummary` region around line 1955). The shared primitive is
  `apiFetch` (lines ~97-153) plus helpers like `recordMutation` (from
  `src/lib/mutation-log.ts`), `shouldRecordMutation`, and the resolver internals.

- **Consumers**: every file under `src/cli/commands/` and `src/mcp/server.ts`
  imports named functions from `../../api/client.js` (or `../api/client.js`).
  Count them first: `grep -rl "api/client" src | wc -l`.

- **Existing structure to mirror**: `src/cli/render/` already splits a concern
  (table.ts, releases-table.ts, release-json.ts) into a folder. Do the same for
  `src/api/`.

- **Convention**: ESM with `.js` import specifiers in TypeScript source (e.g.
  `import { ... } from "../api/client.js"`). Preserve that.

## Commands you will need

| Purpose    | Command                      | Expected on success              |
| ---------- | ---------------------------- | -------------------------------- |
| Typecheck  | `bun run typecheck`          | exit 0                           |
| Full suite | `bun run test`               | all pass                         |
| Lint       | `bun run lint`               | exit 0                           |
| Build      | `bun run build`              | produces `dist/releases`, exit 0 |
| Importers  | `grep -rln "api/client" src` | the list of consumers            |
| Where used | `grep -rn "<fnName>" src`    | call sites of a moved fn         |

## Scope

**In scope**:

- `src/api/client.ts` (becomes a re-export barrel, or is replaced by
  `src/api/index.ts` — see Step strategy)
- New files under `src/api/` (e.g. `core.ts`, `sources.ts`, `orgs.ts`,
  `products.ts`, `releases.ts`, `collections.ts`, `follows.ts`, `webhooks.ts`,
  `admin.ts`)
- Import specifiers in consumer files **only if** you choose Strategy B (see
  below). Strategy A touches zero consumers.

**Out of scope**:

- **Any change to function bodies, signatures, paths, methods, or request
  bodies.** This is a pure move. If you feel the urge to "clean up while here",
  don't — that defeats the test net and inflates the diff.
- `tests/unit/api-client.test.ts` — the characterization tests from Plan 005 must
  pass UNCHANGED. They import `client.*`; keep those imports resolving (Strategy
  A guarantees this; Strategy B requires updating the test imports too — prefer A).
- `src/lib/mutation-log.ts` and other already-separate helpers.

## Git workflow

- Branch: `advisor/006-split-client-module`
- Commit per extracted domain (one commit per moved module) so the history is
  bisectable and review is incremental. Message style:
  `refactor(api): extract <domain> from client.ts`
- Add a `patch` changeset (internal refactor; no user-visible change, but the repo
  versions on every PR — add one to be safe).
- Do NOT push or open a PR unless instructed.

## Strategy: keep `client.ts` as a barrel (Strategy A — REQUIRED unless told otherwise)

To avoid editing ~80 consumer import sites and the Plan 005 tests, **keep
`src/api/client.ts` as a re-export barrel**. Move implementations into new domain
files; `client.ts` becomes:

```ts
export * from "./core.js";
export * from "./sources.js";
export * from "./orgs.js";
// ...one line per new module
```

Every existing `import { X } from ".../api/client.js"` keeps working. This is the
low-risk path. (Strategy B — repoint every consumer at the new modules and delete
the barrel — is more "correct" long-term but multiplies risk; do NOT choose it
unless the operator explicitly asks.)

## Steps

### Step 1: Establish the baseline

Confirm Plan 005 landed: `tests/unit/api-client.test.ts` should contain the
characterization tests. Run the full gate and record that it's green BEFORE
touching anything:

**Verify**: `bun run typecheck` → 0; `bun run test` → all pass; `bun run build` →
produces `dist/releases`. If any fails now, STOP — fix the baseline or report;
do not refactor on a red baseline.

### Step 2: Extract the core primitive first

Create `src/api/core.ts` and move into it: `apiFetch`, the mutation-recording
glue it uses, the shared types/constants it needs (e.g. the UA constant if local),
and any tiny shared helpers every domain calls. Have `core.ts` import from
`src/lib/*` as `client.ts` did. In `client.ts`, replace the moved code with
`export * from "./core.js";` and have the still-in-`client.ts` functions import
the primitive from `./core.js`.

**Verify**: `bun run typecheck` → 0; `bun run test` → all pass. (If circular-import
errors appear, that's the signal a function was split from its dependency — move
it back together and report in your notes.)

### Step 3: Extract one domain at a time

Repeat for each cohesive group, smallest/most-isolated first (suggested order:
`webhooks`, `follows`, `collections`, `admin` [roles/oauth/embeddings/backfill],
`products`, `orgs`, `sources`, `releases`). For each:

1. Create `src/api/<domain>.ts`.
2. Move that domain's functions + domain-only helpers + domain-only types there;
   import shared bits from `./core.js`.
3. Add `export * from "./<domain>.js";` to the `client.ts` barrel.
4. **Verify** after EACH domain: `bun run typecheck` → 0; `bun run test` → all
   pass. Commit. Never proceed to the next domain on a red gate.

Resolver functions (`findSource`, `resolveSourceTarget`, etc.) go with their
entity domain (sources). If two domains genuinely share a resolver, leave it in
`core.ts`.

### Step 4: Final shape and full verification

When all domains are extracted, `client.ts` should be a short barrel (just
`export *` lines). Confirm nothing was dropped:

- `grep -nE "^export (async )?function" src/api/*.ts | wc -l` equals the original
  export count from `eccfd5f` (capture it at Step 1 with
  `git show eccfd5f:src/api/client.ts | grep -cE "^export (async )?function"`).

**Verify (full gate)**:

- `bun run typecheck` → exit 0
- `bun run test` → all pass (including the Plan 005 characterization tests,
  unchanged)
- `bun run lint` → exit 0
- `bun run build` → produces `dist/releases`, exit 0
- `git diff eccfd5f..HEAD -- 'src/api/*.ts'` shows only moves (no body changes) —
  spot-check a handful of moved functions against the original via
  `git show eccfd5f:src/api/client.ts`.

## Test plan

- **No new tests.** This plan is covered by Plan 005's characterization tests
  passing unchanged — that is the proof the move preserved behavior. If 005's
  tests reference functions by `client.<fn>` and Strategy A is used, they keep
  resolving through the barrel.
- Verification: `bun run test` → all pass, same count as after Plan 005.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun run test` passes, with the Plan 005 tests unchanged and green
- [ ] `bun run lint` exits 0
- [ ] `bun run build` produces `dist/releases`
- [ ] `src/api/client.ts` is a barrel of `export *` lines (no function bodies):
      `grep -cE "^export (async )?function" src/api/client.ts` → 0
- [ ] Total exported-function count across `src/api/*.ts` equals the pre-split
      count (no function lost or duplicated)
- [ ] No consumer import sites changed (Strategy A): `git diff --stat eccfd5f..HEAD -- src/cli src/mcp` shows no import-only churn
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report (do not improvise) if:

- The Step 1 baseline is not green (Plan 005 not actually landed, or suite red).
- Circular imports appear that can't be resolved by keeping co-dependent functions
  in the same module — report the dependency knot.
- Any verification gate fails twice after a reasonable fix attempt.
- You find yourself wanting to change a function body, signature, or request
  shape to make the split work — that means the seam is wrong; STOP and report
  rather than altering behavior.
- The export count doesn't reconcile at Step 4 (a function was dropped or
  duplicated).

## Maintenance notes

- New API functions go in the relevant domain module and are picked up by the
  barrel automatically (`export *`). Don't grow `client.ts` back.
- A future Strategy-B follow-up (repoint consumers directly at domain modules,
  delete the barrel) can be done incrementally and safely once this lands — but
  it's optional; the barrel is a fine permanent state.
- Reviewer: the PR should be reviewable as "moves only." Any hunk that isn't a
  pure relocation is a red flag — the whole value of pairing this with Plan 005 is
  that the diff stays mechanical.
