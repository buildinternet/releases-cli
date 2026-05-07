---
"@buildinternet/releases": minor
---

Add `--into-org` / `--into-product` flags to `releases admin discovery onboard` and exit non-zero when `releases admin source create` finds a URL collision with mismatched org/product attribution. Both surfaced during the multi-product Google onboarding (#794).

`--into-org <slug>` (and optionally `--into-product <slug>`) pin the discovery agent to attach every source it adds to that existing org/product, instead of the default behavior of letting the agent auto-create new ones. Eliminates the manual cleanup of orphan orgs that used to follow multi-product onboarding under an existing org. Server-side scope plumbing lands in the monorepo PR; the API surface is `intoOrgSlug` / `intoProductSlug` on `POST /v1/workflows/discover`.

`source create` previously soft-warned and returned `existed: true` when the URL was already attached to a different org/product than the one passed via `--org` / `--product`. It now exits non-zero with the current attribution and a `releases admin source update` hint. `--strict` continues to reject any URL collision regardless of attribution.
