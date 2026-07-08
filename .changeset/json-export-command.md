---
"@buildinternet/releases": minor
---

Add `releases json export <org>` — generate a `releases.json` v2 domain manifest from an already-tracked org. Reconstructs the manifest from what the registry knows about the org (products + release sources) by calling the backend `GET /v1/orgs/:slug/manifest` endpoint, so an owner can host the result at `/.well-known/releases.json` and take ownership of their listing. Prints to stdout by default (pipeable into `releases json validate -`) or writes to a file with `-o/--output`. Completes the owner round-trip alongside `releases json validate`. Re-ingest enriches missing fields only (fill-if-empty), never overwriting existing values.
