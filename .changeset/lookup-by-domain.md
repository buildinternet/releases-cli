---
"@buildinternet/releases": minor
---

Add `releases lookup domain <domain>` for resolving any URL-shaped input to its registry org/products, and `--domain <domain>` on `releases search` for scoping a search to a single org by domain. Mirrors the new `GET /v1/lookups/by-domain` API endpoint and `lookup_domain` MCP tool.
