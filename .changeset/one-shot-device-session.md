---
"@buildinternet/releases": minor
---

`releases login` no longer keeps a signed-in browser session on disk — only the read-only API key it mints. `releases keys` and `releases publish-token` now open a fresh one-time browser approval for each command and sign that session back out as soon as the command finishes, instead of reusing a stored session. `releases auth logout` revokes the stored key directly (no browser approval needed) and always removes the local credential, even if the server-side revoke fails. A credential file saved before this change is upgraded in place: any leftover session token is signed out and stripped the next time it's touched.
