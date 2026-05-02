---
"@buildinternet/releases": patch
---

fix(cli): show full release IDs in `search`, `tail`, and the releases table. The previous 12-char prefix wasn't usable for any follow-up call (the API only resolves full IDs, not short forms), so the truncation was misleading without saving real horizontal space.
