---
"@buildinternet/releases": minor
---

`releases search` gains `--category <slug>` and `--collection <slug>` filters. `--category` scopes hits to organizations in a category (the API validates and resolves curator aliases like `e-commerce` → `commerce`, so the value is forwarded as-is); `--collection` scopes to a curated collection's member orgs (unknown slugs report "no collection matching …", mirroring `--domain`). Both forward to the new `/v1/search` params and compose with the existing `--domain` / `--product` / `--kind` / `--since` / `--until` scopes.
