---
"@buildinternet/releases": minor
---

Add the `releases admin feedback` triage write-path: `triage <id> --status <new|triaged|closed>`, `archive <id>` (with `--undo` to restore), and `delete <id>` (hard delete, gated behind an id typeback or `--yes`). `admin feedback list` gains `--include-archived` and now marks archived rows. Consumes the new `PATCH`/`DELETE /v1/feedback/:id` endpoints.
