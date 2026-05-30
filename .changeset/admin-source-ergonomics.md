---
"@buildinternet/releases": minor
---

Admin source/org ergonomics: three fixes surfaced during a Discord onboarding cleanup.

- `admin source backfill <id|slug>` — new verb wrapping the full-history backfill endpoint (`POST /v1/workflows/backfill-source`). Resolves a slug to the typed `src_…` ID, dry-runs by default (counts + date range), and writes with `--no-dry-run`/`--commit`. Supports `--max-windows` and `--markdown-file` (for JS-heavy / bot-blocked pages the worker can't fetch itself). (#252)
- `admin source create` now accepts `--keyword-allow <list>` (→ `metadata.feedKeywordAllow`) and the general repeatable `--metadata-set key=value`, so feed filters are set atomically at create time. This closes the race where a follow-up `source update` lost to the onboard auto-fetch and ingested the whole unfiltered feed. (#237)
- `admin org delete --hard` now succeeds: it sends the typed `org_` ID the destructive path requires instead of the slug the server rejects. Soft delete still uses the slug. (#236)
