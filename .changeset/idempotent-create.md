---
"@buildinternet/releases": minor
---

Make `org create` and `source create` idempotent on retry. When a duplicate slug (org) or duplicate URL (source) is detected, the existing record is returned instead of erroring — exit code 0, JSON output gains an `existed: true` field. Pass `--strict` to restore the previous exit-1 behavior for callers that require hard failure on conflict.
