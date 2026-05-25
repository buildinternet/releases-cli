---
"@buildinternet/releases": patch
---

`releases admin overview update` now always HTML-entity-decodes the content body before uploading. The five entities sub-agents reflexively over-escape when relaying markdown (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#39;` — e.g. `Q&amp;A`, `streams.input&lt;T&gt;`) are a transport artifact, not authored content, and the API stores the body verbatim — so an un-decoded entity rendered wrong. The decode is single-pass and idempotent, so an already-clean body (including one a caller pre-decoded to compute citation offsets) is unchanged. `--unescape-html` is now the default and kept as an accepted no-op flag for back-compat.
