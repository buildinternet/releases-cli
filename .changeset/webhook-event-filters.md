---
"@buildinternet/releases": patch
---

Add `--product`, `--type`, and `--clear-*` filter flags to `releases webhook add` and `webhook edit`, matching per-event filters on `POST/PATCH /v1/me/webhooks`. Companion to buildinternet/releases#1683.
