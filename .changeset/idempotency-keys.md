---
"@buildinternet/releases": minor
---

Send an `Idempotency-Key` header on effectful write requests (feedback submit, webhook create/rotate-secret/test, API-key mint) so a retry after a network failure replays the original response instead of double-submitting. A key reused with a different payload now surfaces a clear `idempotency_conflict` message instead of a raw 409.
