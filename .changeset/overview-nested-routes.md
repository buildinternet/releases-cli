---
"@buildinternet/releases": patch
---

Overview admin commands now call the nested API routes (`/v1/orgs/:slug/overview`, `/v1/orgs/:slug/overview/inputs`, `/v1/products/:slug/overview`). The `releases admin overview-read`, `overview-write`, and `overview-inputs` commands are unchanged — only the URLs the CLI hits have moved.

`OverviewInputs.selected` entries now carry pre-hydrated `content` (absolute CDN URLs) and a typed `media` array with `r2Url` resolved, so the overview agent can paste image URLs directly into generated markdown.
