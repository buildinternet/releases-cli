---
"@buildinternet/releases": minor
---

Adopt the org-scoped API path shape so the CLI keeps working after the monorepo rejects bare-slug source/product paths with 400 (#698).

- `findSource(identifier)` and `findProduct(identifier)` now branch on the input shape: typed `src_…`/`prod_…` IDs hit the legacy bare path (still safe — IDs are globally unique), `org/slug` coordinates split into the org-scoped form, and bare slugs round-trip through the new `GET /v1/lookups/{source,product}-by-slug` resolver to pick a canonical home before fetching.
- Mutation helpers (`updateSource`, `deleteSource`, `deleteSources`, `deleteReleasesForSource`, `insertReleasesBatch`, `checkContentHash`, `updateSourceMeta`, `updateProduct`) now take a typed-ID-bearing entity object instead of a slug string and target the bare path with `id`, which the API still accepts.
- `getKnownReleasesForSource(identifier, …)` accepts the same identifier shapes as `findSource`.

No CLI command surface changes — operators continue to type slugs, IDs, or `org/slug` coordinates wherever an identifier is accepted. The slug branch costs one extra round-trip to the lookup endpoint per command (cached aggressively at the network layer), which is the price for unambiguous resolution after #690 made slugs per-org.
