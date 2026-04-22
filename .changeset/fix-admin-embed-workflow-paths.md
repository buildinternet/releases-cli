---
"@buildinternet/releases": patch
"@buildinternet/releases-darwin-arm64": patch
"@buildinternet/releases-darwin-x64": patch
"@buildinternet/releases-linux-arm64": patch
"@buildinternet/releases-linux-x64": patch
"@buildinternet/releases-lib": patch
"@buildinternet/releases-skills": patch
---

**Fix `releases admin embed {releases,entities,changelogs}` after monorepo route consolidation**

The API worker moved the three embed-backfill triggers from `/v1/admin/embed/*` to `/v1/workflows/embed-*` in [buildinternet/releases#494](https://github.com/buildinternet/releases/issues/494). Without this bump, those three commands return `404` against the live API.

Changes:

- `embedReleases` now posts to `/v1/workflows/embed-releases`
- `embedEntities` now posts to `/v1/workflows/embed-entities`
- `embedChangelogs` now posts to `/v1/workflows/embed-changelogs`
- `getEmbedStatus` stays on `/v1/admin/embed/status` (telemetry reads were not moved)

The `releases admin embed …` command surface is unchanged — the path rename is invisible to users.
