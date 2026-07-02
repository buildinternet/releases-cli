---
"@buildinternet/releases": patch
---

Read API error messages from the standardized nested error envelope. The API now
returns `{ error: { code, type, message } }`; the CLI was still reading a
top-level `body.message`, so non-2xx responses surfaced a generic status text
(e.g. "Bad Request") instead of the server's actual message. A new
`apiErrorMessage()` reader pulls `error.message` (tolerating the legacy flat
`{ message }` body), restoring precise error output.
