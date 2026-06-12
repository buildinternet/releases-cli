---
"@buildinternet/releases": patch
---

`releases import` now dedups org accounts on the exact `(platform, handle)` pair instead of platform alone (#283). `org_accounts` is one-to-many — the server's unique index is on the pair — so an org can hold a second handle on a platform it's already linked to (e.g. Cloudflare's `x/Cloudflare` plus `x/cfchangelog`). Previously, importing a manifest that added a second handle on an already-linked platform was silently skipped, logging "already linked" for a handle that was never linked. The import now fetches the org's full account list and links any pair it doesn't already hold; an exact already-linked pair still reports "already linked" and is not re-created. The `--dry-run` preview mirrors the same dedup so it no longer over-reports accounts it would link.
