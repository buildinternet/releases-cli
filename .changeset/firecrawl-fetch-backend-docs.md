---
"@buildinternet/releases": patch
---

Document Firecrawl monitoring as a fetch backend in the changelog skills: add it as step 5 of the `parsing-changelogs` pipeline overview, and note in `managing-sources` / `finding-changelogs` that for sources behind a Cloudflare Managed Challenge (persistent `no_change` / 0 releases that `--render` can't fix), Firecrawl is enabled per-source via the admin API (`POST /v1/sources/:slug/firecrawl/sync`), not a CLI verb or `--metadata-set`.
