---
"@buildinternet/releases": patch
---

Return `undefined` from `getMonthlySummary` on a GET 404 instead of throwing `TypeError: Cannot read properties of null`. The function's declared return type is `Promise<ReleaseSummary | undefined>`; the null guard (`rows?.[0]`) now honors that contract.
