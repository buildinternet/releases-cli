---
"@buildinternet/releases": patch
---

Send a distinctive `User-Agent` header (`releases-cli/<version> (+https://releases.sh)`) on every outbound HTTP request — registry API calls, `releases check` feed probes, update checks, telemetry. Replaces the previous fall-through to Bun/undici's default `node` UA so api.releases.sh analytics and third-party site operators can identify CLI traffic.
