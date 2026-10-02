---
"@buildinternet/releases": minor
---

Add `--official` / `--no-official` to `releases admin oauth client create`, a new `releases admin oauth client update` command for the `official`, `trusted` and `disabled` flags, and show `official` in `client list` / `get` output. The flag controls the "Verified by Releases Index" badge on the consent page and needs an API with buildinternet/releases#2421. An older API ignores `official` on create and rejects an `update` that sets only `official`.
