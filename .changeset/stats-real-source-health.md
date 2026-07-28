---
"@buildinternet/releases": patch
---

Fix `releases stats` reporting every source as never-fetched with zero recent releases. The command composed its summary from the legacy flat fields of `/v1/stats` and hardcoded source health, `releasesInPeriod`, and every `lastFetchedAt` to `0`/`null` — a stale workaround from before the endpoint returned the full `StatsSummary` shape. It now reads the server's real values, so the output reflects actual ingestion health instead of implying the index is dead.
