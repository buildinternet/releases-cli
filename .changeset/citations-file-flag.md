---
"@buildinternet/releases": minor
---

`admin overview update` accepts an optional `--citations-file <path>` pointing
at a JSON array of inline citations (`{startIndex, endIndex, sourceUrl, title?,
citedText}[]`). The CLI validates the shape locally and forwards the array to
`POST /v1/orgs/:slug/overview`, which persists them to `knowledge_page_citations`
with replace-all semantics. Pairs with the regenerating-overviews skill, which
now passes the file produced by the agent's response walk.
