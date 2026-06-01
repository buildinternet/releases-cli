---
"@buildinternet/releases": minor
---

`admin product list` now lists products across all orgs when the org argument is omitted.

The org argument is optional: `releases admin product list` (no org) enumerates products across every org, honoring `--kind`, `--json`, and the new `--limit`/`--page` pagination flags. The cross-org table gains an **Org** column so a bare product slug stays attributable; org-scoped listing keeps its original columns. This closes the CLI↔MCP gap that blocked a cross-org `kind=sdk` audit — previously expressible only via the remote MCP `list_catalog` tool (buildinternet/releases-cli#259). Backed by the existing org-agnostic `GET /v1/products` endpoint; no API change required.
