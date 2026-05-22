---
"@buildinternet/releases": minor
---

Standardize environment variables on the `RELEASES_` prefix (`RELEASES_API_KEY`, `RELEASES_API_URL`, `RELEASES_DATA_DIR`, `RELEASES_TELEMETRY_DISABLED`, `RELEASES_DISCOVERY_ENGINE`, `RELEASES_CLIENT_*`, `RELEASES_INSTALL_DIR`). Legacy `RELEASED_`-prefixed names still work but now emit a one-time deprecation warning and will be removed in a future release.
