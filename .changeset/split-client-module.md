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

Internal refactor: split `src/api/client.ts` into per-domain modules (admin, collections, follows, orgs, products, releases, sources, webhooks) behind a re-export barrel. No user-visible changes.
