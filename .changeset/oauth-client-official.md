---
"@buildinternet/releases": minor
---

Add `--official` / `--no-official` to `releases admin oauth client create`, a new `releases admin oauth client update` command for the `official`, `trusted` and `disabled` flags, and show `official` in `client list` / `get` output. The flag controls the "Verified by Releases Index" badge on the consent page and has no effect against an API that predates it.
