---
"@buildinternet/releases": minor
---

Add bulk release delete and suppress to `releases admin release`. Multiple positional `rel_…` IDs or `--file` (one ID per line, `-` for stdin) route through `DELETE /v1/releases/batch` and `POST /v1/releases/batch-suppress`; a single ID keeps the existing per-row endpoints. `scripts/bulk-suppress.ts` now uses the batch API grouped by reason instead of one HTTP call per release. Pairs with buildinternet/releases#1654.
