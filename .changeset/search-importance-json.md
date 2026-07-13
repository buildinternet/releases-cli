---
"@buildinternet/releases": patch
---

`releases search --json` now passes AI-scored `importance` (1–5) through in the slim search-hit shape, normalized to `null` when unscored — same norm as `get` / `tail` / `latest`. The TTY search table also marks importance ≥ 4 with the quiet glyph. Depends on the registry search hit wire field from monorepo #2135.
