---
"releases-cli": minor
---

Rename the local stdio MCP server's tools (`releases admin mcp serve`) to mirror the canonical names served by the hosted server at `mcp.releases.sh`: `search_releases` → `search` (now returns the full unified result — orgs, catalog, and releases — with an optional `type` section filter), `list_sources` + `list_products` → `list_catalog` (org-scoped via `GET /v1/orgs/:slug/catalog`; global path folds products + standalone sources), and `get_product` → `get_catalog_entry` (dispatches product vs. source on the identifier prefix). `get_source` / `get_source_changelog` are unchanged.
