---
"@buildinternet/releases": minor
---

Add `releases auth` commands (`login`, `logout`, `status`, `token`) to store a verified API token in `~/.releases/credentials` (0600). `whoami` now aliases `auth status`. Tokens are verified against `GET /v1/tokens/me` before saving; the env var `RELEASED_API_KEY` still takes precedence.
