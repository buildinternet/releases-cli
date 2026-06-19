---
"@buildinternet/releases": minor
---

Add user-facing `releases webhook` commands for self-serve `/v1/me/webhooks`: `list`, `add`, `show`, `edit`, `remove`, `test`, `rotate-secret`, and `deliveries`. Requires `releases login` (or `RELEASES_API_KEY`). Supports org-scoped (`--org`, optional `--source`) and follows-scoped (`--scope follows`) subscriptions. `webhook verify` remains a local, no-auth signature check. Closes buildinternet/releases-cli#320.
