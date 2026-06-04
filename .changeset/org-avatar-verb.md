---
"@buildinternet/releases": minor
---

feat(org): `admin org avatar <org> --from <source>` — one-step avatar ingest (#1406)

Resolve an image, mirror it to R2, and set the org avatar in a single command. `--from` accepts an `https://` URL, or a shortcut derived from the org's own data (no fuzzy matching): `github` (the org's linked GitHub handle → `github.com/{handle}.png`), `favicon` (the org domain's apple-touch-icon), or `appstore` (the org's App Store source → iTunes 1024px artwork). Resolution runs CLI-side; the server fetches, validates it's a square raster, and stores it — CF credentials stay server-side. Backed by `POST /v1/orgs/:slug/avatar` (api-types 0.30.0).
