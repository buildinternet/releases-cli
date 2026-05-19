---
"@buildinternet/releases": minor
---

Add `--kind <value>` support for the new source/product taxonomy (`platform | sdk | mobile | desktop | docs | integration | tool`). Write paths (`releases admin source update`, `releases admin product update`, `releases admin product create`) accept the flag and validate locally via `isValidKind` before hitting the API. Read paths (`releases list`, `releases admin source list`, `releases admin product list`, `releases search`) accept `--kind` as a filter and pass it through as a query string. The API applies inheritance (`COALESCE(source.kind, product.kind)`) on content-oriented surfaces and direct equality on metadata-oriented surfaces; see the help text for the per-command behavior. Bumps the pinned `@buildinternet/releases-core` and `@buildinternet/releases-api-types` to `^0.22.0`.
