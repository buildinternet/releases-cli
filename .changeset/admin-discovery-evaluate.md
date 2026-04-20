---
"@buildinternet/releases": minor
"@buildinternet/releases-darwin-arm64": minor
"@buildinternet/releases-darwin-x64": minor
"@buildinternet/releases-linux-arm64": minor
"@buildinternet/releases-linux-x64": minor
"@buildinternet/releases-lib": minor
"@buildinternet/releases-skills": minor
---

**`releases admin discovery evaluate <url>` is back**

Ships the missing thin wrapper around `GET /v1/evaluate?url=...`, returning the AI-backed ingestion recommendation (method, feed URL, provider, confidence, alternatives). Supports `--json` for piping into `jq`. Mirrors the typed MCP `evaluate_url` tool.

The legacy top-level alias `releases evaluate <url>` still resolves to this subcommand (with a deprecation warning).

The stale `discover` entry in the legacy alias table has been removed — it pointed to a subcommand that never existed, and the API's `POST /v1/discover` is already covered by `releases admin discovery onboard`. The one in-repo docs reference has been updated.
