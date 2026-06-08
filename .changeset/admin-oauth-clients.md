---
"@buildinternet/releases": minor
---

feat(admin): `releases admin oauth client …` verbs

Add CLI verbs to register and manage "Sign in with Releases" OAuth clients, wrapping the root-key-gated `/v1/admin/oauth/clients` routes from buildinternet/releases#1482. `create` (with `--redirect-uri`/`--scope` repeatable, `--trusted`, `--public`/PKCE, `--no-pkce`) prints the `reloc_` secret once; `list`/`get` are secret-free; `disable`/`enable` toggle the reversible kill switch; `trust`/`untrust` toggle consent-screen skipping; `rotate-secret` issues a new secret once; `delete` is a hard removal.
