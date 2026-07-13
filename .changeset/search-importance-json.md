---
"@buildinternet/releases": minor
---

`releases search --json` now passes AI-scored `importance` (1–5) through in the slim search-hit shape, normalized to `null` when unscored — same norm as `get` / `tail` / `latest`. The TTY search table also marks importance ≥ 4 with the quiet glyph. Bumps `@buildinternet/releases-api-types` to `^0.48.0` for the search/related/digest wire field (monorepo #2135).
