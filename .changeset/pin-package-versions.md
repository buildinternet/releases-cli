---
"@buildinternet/releases": patch
---

Pin all `package.json` dependencies to exact versions (no `^` or `~` ranges). bun.lock already pinned to exact versions with sha512 integrity, but package.json declared caret ranges, so any lockfile regeneration could silently pull a newer compatible version. Pinning closes that gap and pairs with the new Dependabot bun ecosystem (#75) which will surface upstream bumps as grouped weekly PRs. Resolved versions and integrity hashes are unchanged; this is a metadata-only bump.
