---
"@buildinternet/releases": minor
"@buildinternet/releases-darwin-arm64": minor
"@buildinternet/releases-darwin-x64": minor
"@buildinternet/releases-linux-arm64": minor
"@buildinternet/releases-linux-x64": minor
"@buildinternet/releases-core": minor
"@buildinternet/releases-lib": minor
"@buildinternet/releases-skills": minor
---

**CLI JSON contract: shared envelope, parsed metadata, truncation warnings**

`releases list --json` now returns a consistent `{ items, pagination }` envelope whether or not `--limit` is passed, parses `metadata` into a nested object (no more `.metadata | fromjson?` in jq), and emits a stderr warning when results may be truncated.

- **New shared types** in `@buildinternet/releases-core/cli-contracts`: `ListResponse<T>`, `Pagination`, `DEFAULT_PAGE_SIZE`, `computePagination()`, `parseMetadataField()`, `formatTruncationWarning()`. Single source of truth for the CLI's `--json` output shape.
- **Default page size is now 500** (previously 100, the API's silent default) so a default `releases list --json` call returns 5× more rows before any risk of truncation. Explicit `--limit` still wins.
- **Metadata fields are parsed** into nested objects in `--json` output for both the list view and single-source detail view.
- **Stderr truncation warning** when no `--limit` was passed and `hasMore` is true — no more silent loss of rows.
- **`--flat` flag** returns the legacy bare-array shape for scripts still tied to it. Not recommended; use the envelope.
- **Server-side pagination** — `--limit` and `--page` are now passed through to the API instead of applied client-side to an already-truncated result set.

Fixes buildinternet/releases-cli#24 (CLI side). An API-side follow-up will add an opt-in envelope response so `totalItems` can be populated for every page; until then `totalItems` is only set when the tail of the list is reached.
