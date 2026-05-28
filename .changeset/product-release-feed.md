---
"@buildinternet/releases": minor
---

Add `releases latest --product <org/slug>` (alias `releases tail --product`) to show one product's cross-source release feed, backed by `GET /v1/orgs/:slug/releases?product=`. Accepts an `org/slug` coordinate, a `prod_…` id, or a bare product slug; composes with `--count`, `--since`/`--until`, `--include-coverage`, `--json`/`--full`, and `--follow`. It can't combine with a `[source]` argument or `--org`.

The local MCP server's `get_latest_releases` tool now filters by product correctly too — previously its `product` argument was misrouted as a source filter, silently returning the wrong results.
