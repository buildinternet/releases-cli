---
"@buildinternet/releases": minor
---

`releases get <product>` now shows a preview of the product's latest releases inline (its cross-source feed via `GET /v1/orgs/:slug/releases?product=`), matching what `get <org>` and `get <source>` already do. Previously a product card showed only metadata and pointed users at the org feed (which mixes sibling products) or a single source to see any releases — an extra round-trip for the unit that's now the primary one. The "Next steps" footer leads with `releases latest --product <org/slug>` for the full feed, and the `--json` output gains a `releases` array for parity with the org/source shapes.
