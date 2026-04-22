---
"@buildinternet/releases": minor
"@buildinternet/releases-darwin-arm64": minor
"@buildinternet/releases-darwin-x64": minor
"@buildinternet/releases-linux-arm64": minor
"@buildinternet/releases-linux-x64": minor
"@buildinternet/releases-lib": minor
"@buildinternet/releases-skills": minor
---

**Skills synced to the monorepo's consolidated tool surface**

Mirrors the tool-UX consolidation from the monorepo (upstream issue [buildinternet/releases#459](https://github.com/buildinternet/releases/issues/459)). Deprecated per-action tool names are replaced with the consolidated equivalents across every skill that cited them.

Typed-tool renames:

- `add_source` / `edit_source` / `remove_source` / `fetch_source` → `manage_source` with `action: "add" | "edit" | "remove" | "fetch"`
- `get_playbook` / `update_playbook_notes` → `manage_playbook` with `action: "get" | "update_notes"`
- `list_categories` — retired; valid categories surface via `manage_org` / `manage_product` tool descriptions and system prompts

Skill-specific changes:

- `managing-sources` — Primary Sources section rewritten with conditional `is_primary` guidance, added a note about the slug auto-suffix behavior on `manage_source(action=add)`, ported the Organization Descriptions + Embedding Side Effects sections from upstream.
- `seeding-playbooks` and `parsing-changelogs` — replaced the stale `releases admin content playbook` CLI path with `releases admin playbook` (the `content` subgroup was removed in #42).
- `analyzing-releases` and `finding-changelogs` — call-site updates only.

No CLI behavior changes.
