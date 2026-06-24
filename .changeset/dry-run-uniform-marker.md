---
"@buildinternet/releases": minor
---

Agent-DX: uniform `dryRun: true` marker on every dry-run output, and `--dry-run` for the mutations that lacked it.

- Every `--json` dry-run payload now carries a uniform `dryRun: true` marker (via the new `markDryRun` helper in `src/lib/dry-run.ts`), additively — each command keeps its existing preview fields (`status: "would-add"`, `wouldUpdate`, `wouldRemove`, `wouldPost`, …). An agent can now detect "this was a preview, not a write" without per-command knowledge.
- Added `--dry-run` to the mutations that previously had none: `follow`/`unfollow`, `keys create`/`keys revoke`, `admin webhook add`/`edit`/`remove`/`test`/`rotate-secret`, and `admin onboard apply` (per-source would-action preview, no writes).
- `admin release delete --source` and `import` gained a `--json` dry-run body where they previously printed only text.
