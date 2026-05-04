---
"@buildinternet/releases": minor
---

Restructure `admin overview` as a subcommand group and add the planning manifest commands (closes [buildinternet/releases#715](https://github.com/buildinternet/releases/issues/715)).

Canonical surface mirrors the verb-rename pattern (PR #113) — `admin overview list/get/update/inputs/plan` are subcommands under `admin overview`. The legacy kebab-case names (`overview-list`, `overview-write`, `overview-inputs`, and the bare `overview <slug>` read form) are wired as deprecated aliases that warn-and-delegate to the same handler.

New planning surface:

- `admin overview list --stale-days <n> --missing --has-activity --json` — drives `GET /v1/admin/overviews`, returning a planning-ready manifest in one call instead of `org list` + per-org `overview` round-trips. Each row includes `releasesSinceOverview` (the freshness signal that actually matters), `staleness` (`missing | behind | fresh`), `orgLastActivity`, etc. The legacy `--stale / --stale-min-releases / --stale-grace-days` flags still work and trigger the older client-side scan.
- `admin overview plan --json` — same manifest with `format=plan`, adding per-row `action` (`missing | refresh | skip`) and `needsFetch` (true when active sources exist but ingest is lagging ≥ 7 days).
- `admin overview inputs <org> --check` — pre-flight payload (`{orgSlug, selected, totalAvailable, hasExistingContent, wouldRegenerate, windowDays}`) so an orchestrator can decide whether to dispatch a regen sub-agent without paying for the full release-content + media payload.

Requires `@buildinternet/releases-api-types` 0.6.0 on the server side.
