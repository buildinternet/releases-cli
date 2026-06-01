---
"@buildinternet/releases": minor
---

Admin source backfill/re-extract: async-aware backfill + a new `reextract` verb.

- `admin source backfill` now handles the async dispatch shape. Deep Firecrawl backfills run as a durable workflow (buildinternet/releases#1281/#1282) and return `202 { instanceId, statusUrl }` instead of a report; the CLI now detects this rather than crashing on the non-report body. Matching `admin overview batch`, it **dispatches and returns the workflow instance ID by default** (non-blocking — the right primitive for the CLI's primary agent users), with `--wait` to poll inline and render the report. New sibling `admin source backfill-status <instanceId>` does a single-shot status read (renders the report when complete) so a dispatched workflow can be polled on the caller's own cadence. The Firecrawl-ceiling `guidance` hint is now surfaced. (buildinternet/releases#1285)
- `admin source reextract <id|slug>` — new verb wrapping `POST /v1/workflows/reextract-source` (buildinternet/releases#1284). Re-extracts releases from a stored raw snapshot (`released-raw`) with no live scrape, no Firecrawl credits, deterministic input — for reprocessing history after extraction/parse logic improves. Dry-run by default; `--snapshot-id` pins a specific capture, `--commit`/`--no-dry-run` writes. Surfaces the endpoint's actionable errors (`no_snapshot`/`snapshot_not_found` 404, `snapshot_expired` 410, non-scrape 400, missing bucket/key 503). (buildinternet/releases-cli#257)
