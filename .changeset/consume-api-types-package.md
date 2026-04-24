---
"@buildinternet/releases": patch
---

Replace the handwritten `src/api/types.ts` with a re-export from the newly-published `@buildinternet/releases-api-types` package. Eliminates drift between the CLI's wire-protocol types and the monorepo source.

Additive fields now surfaced on `--json` output:

- Source shapes gain `lastPolledAt`, `medianGapDays`, `lastRetieredAt`
- New `ReleaseCoverageResponse` / `ReleaseCoverageRow` types for release coverage consumers
- `SearchCatalogHit` is now the canonical name for catalog/product search hits (`SearchProductHit` remains as a deprecated alias)
