---
"@buildinternet/releases": minor
---

Add `--primary` to `admin source create` so an org's primary changelog can be marked in one step (`isPrimary` on the create POST), instead of creating the source and then running a follow-up `admin source update <slug> --primary`. The REST create endpoint and the `manage_source` "add" action already accepted this — the CLI was the only surface missing it, so it no longer rejects the `--primary` the `managing-sources` skill documents.
