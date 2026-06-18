---
"@buildinternet/releases": patch
---

Internal refactor: split `src/api/client.ts` into per-domain modules (admin, collections, follows, orgs, products, releases, sources, webhooks) behind a re-export barrel. No user-visible changes.
