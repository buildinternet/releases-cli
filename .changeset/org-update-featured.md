---
"@buildinternet/releases": minor
---

`admin org update` now accepts `--featured` / `--no-featured`, so operators can curate the editorially-featured org list (the home-page rail, buildinternet/releases#1274/#1275) from the terminal instead of only via the web Admin menu or a raw API `PATCH`. The flag maps to `PATCH /v1/orgs/:slug { featured }`; aliased onto the deprecated `org edit` too. (#253)
