---
"@buildinternet/releases": minor
---

Agent-DX: `--page-all` streams every page of a list reader as NDJSON.

`releases list --json --page-all` (and `org list` / `admin product list`) walks every page itself and emits one source/org/product per line as newline-delimited JSON, instead of returning a single `{ items, pagination }` page the caller has to paginate by hand.

- One agent command consumes a whole result set — no `--page`/`--limit` bookkeeping, no truncation warning to react to.
- NDJSON keeps memory flat and lets a consumer (`jq -c`, a stream parser) process rows as they arrive rather than buffering one giant array.
- `--json`-only, like `--full`/`--fields`: without `--json` it warns and falls through to the normal table. `--page-all` together with `--page` is rejected (they contradict). `--limit` still sets the per-request page size as a round-trip tuning knob.
- Shared backend in `src/lib/paginate.ts` (`streamAllPages`), reusable for future page-based readers.
