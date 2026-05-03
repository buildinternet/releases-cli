---
"@buildinternet/releases": patch
---

Bump `@buildinternet/releases-api-types` to `^0.4.0`. Adds the optional `type: "feature" | "rollup"` field to release-shaped wire types (`ReleaseItem`, `ReleaseDetail`, `SearchReleaseHit`) so consumers can render rollup posts (Brex Fall Release, Ramp quarterly editions, etc.) differently from feature releases. Optional on the wire — older API responses degrade gracefully.
