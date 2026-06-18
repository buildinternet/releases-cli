---
"@buildinternet/releases": patch
---

Restrict credential file ACLs on Windows using `icacls` after write so the token file is readable only by the current user. Soft-fails silently if `icacls` is unavailable, leaving login functional. Unix behavior unchanged.
