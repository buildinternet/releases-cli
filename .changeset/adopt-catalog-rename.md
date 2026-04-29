---
"@buildinternet/releases": patch
---

Adopt the `catalog` rename in unified search responses (monorepo issue #539 follow-up). `releases search` now reads `response.catalog` and renders the section as **Catalog** in human and markdown output (it covered products + standalone sources already; the header now matches the wire field). `--type catalog` is the canonical filter; `--type products` is accepted as a deprecated alias. The deprecated `response.products` field is still read as a fallback so older API deploys keep working — that fallback can be dropped once the alias is removed from the wire. Plugin docs and the `releases-mcp` skill updated to point at the new `search` / `list_catalog` / `get_catalog_entry` MCP tools.
