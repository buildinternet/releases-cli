---
"@buildinternet/releases": minor
---

MCP `list_organizations` now mirrors the remote MCP default of hiding orgs
with zero indexed releases. Pass `include_empty: true` to see them.
CLI `releases org list` gains `--include-empty` for the same opt-in.
See buildinternet/releases#746.
