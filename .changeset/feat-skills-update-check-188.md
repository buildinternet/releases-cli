---
"@buildinternet/releases": minor
---

feat(cli): nag when installed agent skills are behind the repo's `main` HEAD (#188). After a successful `releases skills install`, the CLI records the current `skills/` tree SHA as a baseline. Subsequent invocations poll GitHub (24h cache, 2s timeout, best-effort) and print a single dim stderr line — "Your installed releases skills are behind. Run `releases skills install` to refresh." — when the baseline diverges. Mirrors the existing CLI update-check pattern, with the same skip conditions (`--help`/`--version`, non-TTY, no baseline recorded) plus a fresh `RELEASES_DISABLE_SKILL_UPDATE_CHECK=1` opt-out.
