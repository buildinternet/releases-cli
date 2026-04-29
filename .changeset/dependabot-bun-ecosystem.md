---
"@buildinternet/releases": patch
---

Add the `bun` ecosystem to the Dependabot config so npm dependency bumps land as weekly grouped PRs (production and dev separated). Pairs with the SHA-pinned GitHub Actions config — bun.lock already pins every package by sha512 integrity hash and CI runs with `--frozen-lockfile`, so this closes the loop on surfacing upstream drift. CI-only; no runtime behavior change.
