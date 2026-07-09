---
"@buildinternet/releases": patch
---

Consolidate agent skills by audience: this repo now ships only the three user-facing skills (`releases-mcp`, `releases-cli`, `analyzing-releases`). The `releases-admin` plugin, its five mirrored operator skills, and the `discovery`/`worker` agent definitions are removed — the canonical operator skills live in the backend monorepo's `.claude/skills/` tree. The `@buildinternet/releases-skills` npm wrapper is retired (removed from the workspace and the changesets fixed group; deprecated on npm). `npx skills add buildinternet/releases-cli` and `releases skills install` continue to work unchanged.
