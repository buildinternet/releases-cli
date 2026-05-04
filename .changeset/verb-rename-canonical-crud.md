---
"@buildinternet/releases": minor
---

Rename CRUD verbs to standard create/get/update/delete equivalents. The old verb names (add, show, edit, remove) are retained as deprecated aliases that continue to work but print a deprecation warning to stderr. This affects top-level commands and all `org`, `product`, `source`, and `release` subcommands.
