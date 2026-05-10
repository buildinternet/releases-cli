---
"@buildinternet/releases": patch
---

Drop deprecated `contentSummary`, `contentTitle`, and `contentTitleShort` aliases from all read paths. The CLI now reads only the canonical `summary`, `titleGenerated`, and `titleShort` fields introduced in buildinternet/releases#860. This is the consumer-side preflight gate for the alias removal tracked in buildinternet/releases#866.
