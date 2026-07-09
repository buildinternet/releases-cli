---
"@buildinternet/releases": patch
---

Add `releases admin release refetch <releaseId>` to re-fetch a single release's live page and heal it in place (title/content/publishedAt, same `rel_` id). Supports `--url` for releases whose stored URL is a synthesized `#fragment` index anchor, defaults to a dry-run preview, and writes with `--apply`.
