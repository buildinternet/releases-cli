---
"@buildinternet/releases": minor
---

Add `--hard` to `admin release delete --source` and `admin source delete`. The default stays a soft delete (releases suppress, sources tombstone), but `--hard` passes `?hard=true` so rows are removed outright and the `UNIQUE(source_id, url)` dedup slot frees up — enabling a clean purge + re-ingest without a full org hard-delete (#1184). Also fixes the soft `release delete --source` summary, which previously printed `Deleted undefined releases` because the API returns `{ suppressed }` on that path.
