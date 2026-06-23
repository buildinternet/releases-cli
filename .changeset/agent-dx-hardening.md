---
"@buildinternet/releases": minor
---

Agent-DX hardening: structured `--json` errors and input validation.

- When `--json` is set, thrown errors now emit a parseable `{ error: { kind, message, status?, method?, path?, field? } }` payload on stdout (with a non-zero exit) instead of an unstructured stderr dump. Without `--json`, known error types (API + invalid-input) print a clean one-line message rather than a stack trace.
- User-supplied identifiers are validated before any network call — control characters, `..` traversal, `%` percent-encoding, embedded `?`/`#`, whitespace, and backslashes are rejected at the entity resolvers (`findOrg`/`findProduct`/`findSource`/`getRelease`). `apiFetch` gains a control-character backstop, and file-reading flags reject `..` traversal.
