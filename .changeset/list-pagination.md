---
"@buildinternet/releases": minor
---

Add `--limit <n>` / `--page <n>` pagination to four list commands and consume the
`{ items, pagination }` envelope the API now returns for `/v1/orgs`,
`/v1/admin/blocklist`, `/v1/orgs/:slug/ignored-urls`, and `/v1/sessions`
(monorepo PR #723):

- `releases org list`
- `releases admin discovery task list`
- `releases admin policy block list`
- `releases admin policy ignore list`

All four pass `?limit=&page=` through to the API and read the server's
pagination metadata directly — no more client-side `Array.slice()`. Each prints
a `warning: results may be truncated` message to stderr when more pages are
available and no explicit `--limit` was supplied, mirroring `releases list`.
Closes #105.
