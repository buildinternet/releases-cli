---
"@buildinternet/releases": minor
---

Add `releases publish-token create/list/revoke` for minting a `relk_` token scoped to one source (used by the `publish-changelog` GitHub Action as `RELEASES_API_TOKEN`), matching `POST/GET/DELETE /v1/me/publish-tokens[/:id]`. Companion to buildinternet/releases#2388.
