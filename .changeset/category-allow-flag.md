---
"@buildinternet/releases": minor
---

Add `--category-allow <list>` and `--no-category-allow` flags to `releases admin source update` for setting per-source `metadata.categoryAllow` directly. Drops feed items whose `<category>` doesn't intersect the allowlist (case-insensitive); items with no category are dropped too. Useful on mixed-topic feeds where the upstream tags every entry — `openai.com/news/rss.xml` is the motivating case. Worker-side filter ships in buildinternet/releases#821.

Also adds `scripts/bulk-suppress.ts`, an operator utility that reads `{id, reason}` NDJSON on stdin and runs `releases.suppress` with bounded concurrency (default 8). Used to clean up the existing noise on a source after enabling `categoryAllow`.
