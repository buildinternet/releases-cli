---
"@buildinternet/releases": patch
---

Route `feedback`, `submit`, and `keys` through the shared `apiFetch` transport instead of each rolling its own `fetch` call. `apiFetch` gained an opt-in `skipDefaultAuth` flag so a caller-supplied `Authorization` header (used by `keys`' session-token flow) isn't overwritten by a configured admin/API key. Error messages, idempotency behavior, and command output are unchanged.
