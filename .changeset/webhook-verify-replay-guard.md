---
"@buildinternet/releases": minor
---

`webhook verify` now enforces a ±5 minute timestamp window by default to prevent replay-attack acceptance. Pass `--allow-stale` to skip the window check when verifying old captured payloads.
