---
"@buildinternet/releases": patch
---

`--since` / `--until` now reject impossible calendar dates like `2026-02-30` locally (exit code 2) instead of sending them to the API, which returns a 400 for them.
