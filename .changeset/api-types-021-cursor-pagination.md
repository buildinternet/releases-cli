---
"@buildinternet/releases": patch
---

chore(cli): bump `@buildinternet/releases-api-types` to `^0.21.0` and align `sourceToMarkdown` with the cursor-paginated `SourceDetail` shape. The helper had no callers in production code; this is a types-alignment fix with zero runtime impact.
