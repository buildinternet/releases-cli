---
"@buildinternet/releases": minor
---

feat(cli): `releases login` — device authorization (RFC 8628) (#282)

Add a top-level `releases login` command that authenticates the CLI via the OAuth 2.0 Device Authorization Grant (RFC 8628): it requests a device/user code, opens the verification URL in the browser (with a headless copy-paste fallback), polls for approval, then exchanges the device session for a durable read-only `relu_` API key minted via `POST /v1/api-keys` and stores it through the existing credential path. Backfills the changeset omitted when #282 merged.
