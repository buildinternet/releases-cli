---
"@buildinternet/releases": patch
---

Admin log routes moved under `/v1/admin/logs/*` on the API per issue #504 tier 3. The `releases admin source fetch-log` command and `getUsageStats` / `postUsageLog` / `postFetchLog` helpers are unchanged from the user's perspective, only the underlying URLs shift:

- `GET /v1/fetch-log` → `GET /v1/admin/logs/fetch`
- `POST /v1/fetch-log` → `POST /v1/admin/logs/fetch`
- `GET /v1/usage-log/stats` → `GET /v1/admin/logs/usage/stats`
- `POST /v1/usage-log` → `POST /v1/admin/logs/usage`
