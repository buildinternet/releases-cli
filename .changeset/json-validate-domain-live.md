---
"@buildinternet/releases": minor
---

`releases json validate <domain>` now validates live against the registry's listing endpoint (previously deferred). The domain form POSTs the public `/v1/listing/validate` endpoint and renders the verdict plus the materialization plan — identity, products, and each release locator with its classification ("goes live" / "reviewed first") — ending with an activation pointer for unlisted domains. Exit codes: 0 valid, 1 invalid or check failed (the old unconditional exit 2 is gone). `--json` emits the raw `ListingValidationResult` merged with `{ target }`. Bumps `@buildinternet/releases-api-types` to ^0.39.0 for the listing wire types.
