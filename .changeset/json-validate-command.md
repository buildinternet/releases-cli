---
"@buildinternet/releases": minor
---

Add `releases json validate <path>` — validate a `releases.json` v2 owner manifest against the published schema (`ReleasesJsonConfigSchema`) before publishing it. Accepts a file path or `-` for stdin, detects the hosting scope (domain vs repo) for readable path-anchored errors, and supports `--json` for machine output (exit 0 valid / 1 invalid). The `domain` form (live fetch + materialization plan) is deferred until the public dry-run endpoint lands (buildinternet/releases#1910) so web and CLI share one verdict.
