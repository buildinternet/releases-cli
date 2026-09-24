---
"@buildinternet/releases": patch
---

Fix `releases login` leaking a new `relu_` key on every run. It now remembers the minted key's id and revokes the key it replaces once the new one is safely stored. When the server's active-key limit is hit, the error names the commands to list and revoke keys. `releases auth logout` also revokes the stored key server-side, best-effort. Fixes #418.
