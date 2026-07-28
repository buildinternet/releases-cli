---
"@buildinternet/releases": patch
---

`source backfill --dry-run` now reports how much of the extracted history the source doesn't already have, as `N not yet stored`. Previously the dry-run line reported only how many entries were on the page, which said nothing about whether any of them were missing — during the 2026-07-23 ingest outage that gap let a run over a source missing its entire recent history read as uneventful. Requires an API worker carrying the new `notStored` field; against an older server the clause is omitted rather than guessed. The report type also catches up with the server: `inserted` is `null` on a dry run (nothing was written, no count computed) rather than a fabricated `0`.
