---
"@buildinternet/releases": patch
---

Fix `releases login` leaking a new `relu_` key on every run: it now remembers the minted key's id and revokes the one it's replacing once the new key is safely stored, and offers a way out (list keys, revoke the oldest unused one, retry) when the server's active-key cap is hit instead of just failing. `releases auth logout` also revokes the stored key server-side, best-effort. Fixes #418.
