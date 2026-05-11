---
"@buildinternet/releases": patch
---

Bump `@buildinternet/releases-core` to `^0.21.0` and `@buildinternet/releases-api-types` to `^0.16.0` so the bundled `CATEGORIES` constant picks up the `commerce`, `crm`, `finance`, and `productivity` slugs added in buildinternet/releases#889 and buildinternet/releases#891. Without this, `releases admin org update --category crm` (and the three other new slugs) rejects locally even though the API accepts them.
