---
"@buildinternet/releases": minor
---

Add App Store source support to the admin CLI.

- New `releases admin source create-appstore <url-or-id>` verb — accepts an `apps.apple.com` URL, a bare numeric track ID, or an `appstore:<trackId>` coordinate, with `--platform ios|macos`, `--org`, `--product`, `--storefront`, `--json`, and `--dry-run`. It calls `POST /v1/sources/appstore`, which resolves the listing, mints the first release, and backfills the product's app-icon avatar.
- `releases admin source create` now recognizes `appstore` as a valid type and rejects `--type appstore` / pasted `apps.apple.com` URLs with a pointer to `create-appstore` (source types are now sourced from `@buildinternet/releases-core` instead of a hard-coded list).
- `releases admin product list` and `releases get <product>` surface the product `avatarUrl` (the app icon).
