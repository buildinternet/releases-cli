---
"@buildinternet/releases": minor
---

`releases admin release update` (and its deprecated `release edit` alias) now accept a `--url <url>` flag to set a release's canonical URL. Passing a non-empty value sets the URL; passing an empty string (`--url ""`) clears it. The backend `PATCH /v1/releases/:id` route already accepted the `url` field — this wires it through the CLI.
