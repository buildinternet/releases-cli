---
"@buildinternet/releases": patch
---

Move the agent skills into the self-contained Claude plugin folder (`plugins/claude/releases/skills/`) so the plugin passes Claude plugin directory validation. `npx skills add buildinternet/releases-cli` finds them at the new path, and the skills update check now reads that path.
