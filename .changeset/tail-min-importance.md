---
"@buildinternet/releases": minor
---

Surface the registry's AI-scored release `importance` (1–5, `null` when unscored). `tail`/`latest` gains `--min-importance <1-5>` (forwarded as `?minImportance=`); the human table marks importance ≥4 with a quiet glyph (outline at 4, solid at 5), mirroring the web's render threshold, while `--json` output (`get`/`tail`/`latest`) passes the raw score through verbatim, including `null`. Bumps the `@buildinternet/releases-api-types` and `@buildinternet/releases-core` pins to the versions that carry the `importance` field.
