---
"@buildinternet/releases": minor
---

Add stub-tier org verbs (buildinternet/releases#1947): `releases admin org create-stub` (curator-authored stub org with repeatable `--location` JSON locators and/or `--from-file`), `releases admin org create-stub-from-domain <domain>` (stub from a domain's `/.well-known/releases.json` manifest, `--dry-run` supported), and `releases admin org promote <slug>` (materialize declared locations into sources and flip the org to tracked, `--dry-run` supported). Bumps `@buildinternet/releases-api-types` to ^0.38.0 for the stub-tier wire types.
