---
"@buildinternet/releases": minor
---

Add `--since` / `--until` time-window filters to `releases search` and `releases tail|latest`. Each accepts an ISO date (`2026-01-01`) or relative shorthand (`90d`, `4w`, `6m`, `2y`) and filters releases by publish date, composing with the existing filters. Enables capability-discovery queries like `releases search "slack integration" --since 90d`.
