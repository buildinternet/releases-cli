---
"@buildinternet/releases": minor
---

Surface collections in `releases search` output. Direct LIKE matches on the collection's name/slug/description appear in a new "Collections" section, alongside member rollups for collections containing one of the matched orgs (with an `↳ includes …` hint). Use `--type collections` to narrow to that section. JSON output includes a new `collections` array on the response shell.

Forward-compatible: the field is read as optional, so older API deployments mid-rollout still work — they just return `undefined` and the section stays empty until the API ships the matching change (`buildinternet/releases#955`).
