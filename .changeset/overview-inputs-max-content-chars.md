---
"@buildinternet/releases": minor
"@buildinternet/releases-darwin-arm64": minor
"@buildinternet/releases-darwin-x64": minor
"@buildinternet/releases-linux-arm64": minor
"@buildinternet/releases-linux-x64": minor
"@buildinternet/releases-windows-x64": minor
"@buildinternet/releases-lib": minor
"@buildinternet/releases-skills": minor
---

Add `--max-content-chars [n]` to `releases admin overview inputs`. In `--json` mode it clips each `selected[].content` to at most `n` characters client-side before printing (bare flag defaults to 1000), leaving every other field — `existingContent`, `media`, `totalAvailable`, and the `selected` length itself — untouched. High-volume orgs emit 500K+ chars of full release content here (sentry's largest single release is ~125K), which exceeds the ~30K Bash stdout cap a Claude Code sub-agent reads through and gets silently truncated, so the overview would be generated from only the first few releases. The clip is purely client-side — the CLI still receives the full payload over the wire — so it removes that footgun without the multi-step `jq` workaround. Omitting the flag preserves today's full-content output.
