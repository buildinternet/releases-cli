---
"@buildinternet/releases": minor
---

Add `--auto-generate-content` / `--no-auto-generate-content` to `releases admin org update` — the single backend gate that decides whether an org gets AI overviews and per-release summaries. Previously the only way to toggle it was a raw `curl` PATCH. `releases admin org get` now shows the current value, and `releases admin overview plan` surfaces an `opted_out` action for orgs the batch skips because the flag is off.
