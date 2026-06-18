---
"@buildinternet/releases": patch
---

Wrap `apiFetch` transport errors (DNS failure, connection refused, abort) with endpoint context. The thrown message now includes the HTTP verb and path (`API request failed on GET /v1/…: ECONNREFUSED`), matching the existing HTTP-error message shape. The original error is preserved via `cause`.
