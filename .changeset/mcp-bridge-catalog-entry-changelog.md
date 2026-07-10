---
"@buildinternet/releases": minor
---

The local stdio MCP bridge's `get_catalog_entry` tool now accepts `include_changelog`, `changelog_path`, `changelog_offset`, `changelog_limit`, and `changelog_tokens` — matching the hosted server at mcp.releases.sh — so a source entry's tracked CHANGELOG can be inlined or sliced in the same call, without a separate lookup. `changelog_tokens` takes precedence over `changelog_limit`, and any `changelog_*` param implies `include_changelog`; the params are ignored (with a clear message) for product entries. The standalone `get_source_changelog` tool is now deprecated in favor of these params — it remains registered and functional for this release, but agents should migrate.
