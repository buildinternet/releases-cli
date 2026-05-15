---
"@buildinternet/releases": patch
---

`releases org update --avatar <url>` now works end-to-end. The flag was already wired (it set `avatarUrl` in the PATCH body) but the API silently dropped the field via Zod's default unknown-key stripping. The matching API change landed in `buildinternet/releases#979`; once that ships in the published `releases-api-types` rev, the CLI's `--avatar` and `--no-avatar` flags affect the server state for real.

Forward-compatible: existing scripts that already use `--avatar` start working without any CLI change — the wire shape didn't move, only the server-side acceptance did.
