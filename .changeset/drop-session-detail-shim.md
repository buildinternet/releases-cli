---
"@buildinternet/releases": patch
---

Drop the local `SessionDetail` shim in `task get` now that `@buildinternet/releases-api-types@0.8.1` exposes `agent`, `runner`, `correlationId`, `anthropicSessionId`, `usage`, `warnings`, and `result` natively on `Session`.
