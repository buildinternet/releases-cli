---
"@buildinternet/releases": minor
---

Add personalized follows + feed verbs: `releases follow <org|product>`, `releases unfollow <org|product>`, `releases following` (list), and `releases feed` (your personalized release timeline). They act on the signed-in user's account via the API's `/v1/me/*` routes — sign in with `releases login` (or set `RELEASES_API_KEY`) first. `follow`/`unfollow` accept an org slug, an `org/product` coordinate, or an `org_…`/`prod_…` id; `feed` reuses the same renderer as `releases tail` and is page-paginated (`--page` / `--limit`, `--json`). Requires `@buildinternet/releases-api-types` ≥ 0.32.0 for the follows wire types.
