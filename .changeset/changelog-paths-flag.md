---
"@buildinternet/releases": minor
---

Add `--changelog-paths` and `--no-changelog-paths` flags to `releases admin source update` for setting per-source `metadata.changelogPaths` overrides directly. Replaces the previous workflow of dropping to a raw `curl` against `/v1/sources/.../metadata`. Caps at 20 paths client-side to match the API worker's `CHANGELOG_MAX_FILES`.
