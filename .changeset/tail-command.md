---
"@buildinternet/releases": minor
---

Add `releases tail` as the canonical "latest releases" command (with `latest` retained as an alias), plus `-f/--follow` streaming mode:

- `releases tail -f` polls the cached `/v1/releases/latest` endpoint on a 60-second interval (configurable with `--interval <seconds>`) and streams new releases as they arrive. Novelty detection is client-side via a bounded seen-id set, so every follow-poller collapses onto the shared KV cache entry rather than forking it with a per-client `since`.
- `getLatestReleases` now calls the unified `/v1/releases/latest` endpoint in a single request. Replaces the previous scatter-gather (fetch `/sources`, call `/sources/:slug` for the first 10, sort locally), which sampled rather than enumerated and meant the CLI's "latest across all sources" was incomplete for indexes larger than 10 sources.
- Extracted `renderLatestReleasesTable` into `src/cli/render/` so `tail` and `show` share one formatter.

Requires the API worker to expose `GET /v1/releases/latest` (shipped in the monorepo alongside this change).
