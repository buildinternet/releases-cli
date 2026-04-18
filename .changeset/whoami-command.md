---
"@buildinternet/releases": minor
"@buildinternet/releases-darwin-arm64": minor
"@buildinternet/releases-darwin-x64": minor
"@buildinternet/releases-linux-arm64": minor
"@buildinternet/releases-linux-x64": minor
---

**Add `releases whoami` — mode, API URL, and auth diagnostic**

New top-level command that reports how the CLI is configured:

- Current CLI version
- API URL and whether it's the default (`https://api.releases.sh`) or overridden via `RELEASED_API_URL`
- Mode (`public` vs `admin`) based on whether `RELEASED_API_KEY` is set
- Redacted API key hint (first 4 + last 4 characters) so users can confirm which key is active without leaking it
- Optional `--check` flag that probes the API — a public read in public mode, an auth-gated read in admin mode, so an invalid key surfaces as a 401 instead of a silent success
- `--json` flag for machine-readable output
