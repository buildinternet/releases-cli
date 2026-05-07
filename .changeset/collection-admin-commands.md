---
"@buildinternet/releases": minor
---

Add `releases admin collection` command tree for managing curated cross-org collections (the playlists rendered at `/collections/<slug>` on the registry web app). Subcommands: `list`, `get <slug>`, `create <name>`, `update <slug>`, `delete <slug>`, plus `members add | set | remove` for membership management. Wraps the new admin write endpoints introduced in the registry API (#813); requires `@buildinternet/releases-api-types@^0.9.0`.
