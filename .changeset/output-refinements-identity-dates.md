---
"@buildinternet/releases": patch
---

Refine the release reader output: clearer ownership, shorter labels, human dates.

- `search` release hits now lead with the owning org as `Org/Source` (e.g. `Axiom/Changelog`) so it's clear who ships each result. The org prefix is skipped when the source name already starts with the org name (`Railway Changelog` stays as-is rather than becoming `Railway/Railway Changelog`). Feed views (`get` entity cards, scoped `tail`) are unchanged — the org is already established there.
- The release detail cards (`get <rel_…>` and `release get`) now show an `Org:` line so the owning company is named even when the source is generic (e.g. an "API Release Notes" source under Google).
- `get` / `release get` print the publish date as `Jul 22, 2024` instead of the raw ISO timestamp. `--json` still emits ISO `publishedAt` for machine consumers.
- Trimmed the AI-attribution labels on the `get` card to `AI summary` / `AI headline`, and dropped the redundant `Release` heading above the title.
