---
"@buildinternet/releases": minor
"@buildinternet/releases-core": minor
---

Surface AI-generated org overviews more readily in the CLI:

- `releases org show <slug>` now prints a short preview (first ~80 words) of the AI overview with a generated-at hint and a "⚠ older than 30 days" stale warning where appropriate.
- New `releases org overview <slug>` command (public read, no auth) prints the full overview body with the same staleness signal.
- `@buildinternet/releases-core/overview` exports shared helpers — `OVERVIEW_STALE_DAYS`, `overviewAgeDays`, `isOverviewStale`, `overviewPreview` — used by both the CLI and the upstream MCP server.
