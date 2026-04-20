---
"@buildinternet/releases": patch
"@buildinternet/releases-darwin-arm64": patch
"@buildinternet/releases-darwin-x64": patch
"@buildinternet/releases-linux-arm64": patch
"@buildinternet/releases-linux-x64": patch
"@buildinternet/releases-lib": patch
"@buildinternet/releases-skills": patch
---

Fix `--json` output being truncated at ~96 KB when piped to another process. All JSON output now awaits stdout `drain` before the CLI exits, so piping `releases admin source list --json | jq ...` works correctly on large datasets.
