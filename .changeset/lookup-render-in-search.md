---
"@buildinternet/releases": patch
---

Render on-demand lookup payload in `releases search`. When the API returns a `lookup` field (coordinate-shaped queries like `org/repo`), a Lookup section is printed before the regular results showing the status, a source link, a release preview (up to 5), and a "Did you mean" org rail when available. Included in `--json` output. Bumps `@buildinternet/releases-api-types` peer to `^0.3.0`.
