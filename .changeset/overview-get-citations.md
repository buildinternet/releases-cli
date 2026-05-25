---
"@buildinternet/releases": patch
"@buildinternet/releases-darwin-arm64": patch
"@buildinternet/releases-darwin-x64": patch
"@buildinternet/releases-linux-arm64": patch
"@buildinternet/releases-linux-x64": patch
"@buildinternet/releases-windows-x64": patch
"@buildinternet/releases-lib": patch
"@buildinternet/releases-skills": patch
---

`releases admin overview get` now surfaces inline citations. The table line includes a citation count alongside the release count, and `--json` adds `citationCount` plus the full `citations` array. The org overview GET already returns citations ordered by character position — this exposes them so a post-write `overview get` can verify what `overview update` reported (which echoes `citations: N`) without a re-write.
