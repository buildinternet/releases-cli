---
"@buildinternet/releases": patch
---

Apply `--tags` on idempotent `org create` retry (#116). When `releases admin org create acme --tags react` is followed by `releases admin org create acme --tags typescript`, the second call now adds `typescript` to the existing org instead of silently dropping the flag. Tag merging is additive (no removal), and `--strict` continues to bail on duplicate detection before reconciliation runs.
