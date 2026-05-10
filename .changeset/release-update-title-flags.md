---
"@buildinternet/releases": minor
---

Add `--title-generated`, `--title-short`, and `--summary` flags to `releases release update`. They write through to the API's PATCH /v1/sources/:slug/releases/:id endpoint, which exposes the renamed AI-generated release fields introduced in buildinternet/releases#860.

Pass an empty string to clear a field (e.g. `releases release update rel_xxx --summary=""` writes NULL).

The new fields are accepted by registries running api-types 0.13.0 or later; older registries silently ignore the unknown body keys.
