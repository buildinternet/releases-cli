---
"@buildinternet/releases": minor
---

Accept typed IDs (`org_…`, `prod_…`, `src_…`, `rel_…`) anywhere a slug works.

Help text and argument descriptions across `delete`, `fetch-log`, `tail`,
`check`, `release`, `add`, `update`, `product`, `org`, `ignore`, `list`, and
`fetch` now read "ID or slug" — no command rejects a typed ID anymore. The API
accepted both shapes already; this aligns the CLI surface and docs with that
contract. The `releases-cli` and `releases-mcp` skills are updated to recommend
typed IDs in agent prompts where stability matters more than readability.

Internally, `findOrg`, `removeOrg`, `getOrgDependents`, `updateOrg`,
`getRecentReleases`, `getOverview`, `getPlaybook`, `getAliases`, and
`setAliases` rename their `slug` parameter to `identifier` and gain
`encodeURIComponent` wrappers (the path-building was previously unencoded —
fine for current slug shapes but a lurking bug). `getFetchLogs({ sourceSlug })`
becomes `getFetchLogs({ source })` and `getLatestReleases({ slug, orgSlug })`
becomes `getLatestReleases({ source, org })` — both still accept whatever
identifier shape the user types.
