---
"@buildinternet/releases": patch
---

Follow-up to the overview nesting: three more API surfaces moved under their parent resource.

- Playbook: `getPlaybook(slug)` and `updatePlaybookNotes(slug, notes)` now call `/v1/orgs/:slug/playbook` and `/v1/orgs/:slug/playbook/notes`.
- Summaries: `getSummariesForSource`, `upsertSummary`, and `getMonthlySummary` now call `/v1/sources/:slug/summaries`. `upsertSummary`'s signature changed from `(data)` (with `sourceId` in the body) to `(sourceSlugOrId, data)`.
- Aliases: the `/v1/aliases` endpoints are gone. Domain aliases are now a `string[]` field on the parent — read via `/v1/orgs/:slug` or `/v1/products/:slug`, written via `PATCH { aliases: [...] }` on the parent. The CLI replaces `addDomainAlias`/`removeDomainAlias`/`listDomainAliases` with `getAliases(scope, slug)` and `setAliases(scope, slug, aliases)`. `releases org alias add|remove|list` and `releases product alias add|remove|list` commands are unchanged from the user's perspective.

`/v1/knowledge` is also gone from the API. No CLI helper referenced it.
