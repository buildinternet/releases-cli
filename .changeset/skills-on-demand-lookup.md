---
"@buildinternet/releases-skills": patch
---

docs(skills): document the on-demand GitHub lookup behavior in the `releases-cli` and `releases-mcp` skills. When a user types a `{org}/{repo}` coordinate (or `github:org/repo`) and no entity matches, the registry probes GitHub on demand and surfaces the result as a `lookup` field. Coordinate matching is case-insensitive.
