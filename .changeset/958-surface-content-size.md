---
"@buildinternet/releases": patch
---

Surface release body size on the latest-releases table (`releases get <org>`, `releases get <src_…>`, `releases tail`). Each row picks up a dim "~1.5K tokens" hint next to the title when the cached `contentTokens` field is available, so agents browsing a feed can decide whether to pull the full body before spending the round-trip. Compact mode only shows the hint for releases ≥1K tokens; `--with-summary` shows it on every row.

Forward-compatible: the field is read as optional. API deployments mid-rollout return `undefined` and the hint is silently dropped. Lights up once `@buildinternet/releases-api-types` ships the matching wire-shape change (`buildinternet/releases#958`).
