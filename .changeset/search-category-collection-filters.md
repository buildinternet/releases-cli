---
"@buildinternet/releases": minor
---

`releases search` gains `--category <slug>` and `--collection <slug>` filters. `--category` scopes hits to organizations in a category (validated client-side against `releases categories`; the API resolves aliases and is the source of truth); `--collection` scopes to a curated collection's member orgs (unknown slugs report "no collection matching …", mirroring `--domain`). Both forward to the new `/v1/search` params and compose with the existing `--domain` / `--product` / `--kind` / `--since` / `--until` scopes.
