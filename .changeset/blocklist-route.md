---
"@buildinternet/releases": patch
---

Move admin blocklist calls to `/v1/admin/blocklist` (was `/v1/blocked-urls`). The registry renamed the route to align with the `/v1/admin/...` convention; the old path is going away. Affects `releases admin block` / `unblock` and the `releases whoami` admin probe.

Closes [registry #524](https://github.com/buildinternet/releases/issues/524).
