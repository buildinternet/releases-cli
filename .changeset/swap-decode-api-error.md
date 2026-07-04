---
"@buildinternet/releases": patch
---

Read API error messages through api-types' canonical `decodeApiError` instead of a hand-rolled envelope reader. Behavior is unchanged — the nested `{ error: { code, type, message } }` envelope, a legacy flat `{ message }` body, and malformed payloads (which fall back to the HTTP status text) all resolve exactly as before — but the CLI now shares the published wire-shape decoder rather than duplicating it. Bumps `@buildinternet/releases-api-types` to `^0.35.0` and `@buildinternet/releases-core` to `^0.25.0` (the versions that first export the errors module).
