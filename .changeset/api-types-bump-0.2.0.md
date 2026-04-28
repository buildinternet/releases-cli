---
"@buildinternet/releases": patch
---

Bump `@buildinternet/releases-api-types` to `^0.2.0`. The classification fields (`errorSource`, `errorType`, `stopReason`, `retryCount`) added by the registry to the `Session` shape now come straight from the published types, so the CLI's local `SessionWithClassification` extension is gone. No behavior change.
