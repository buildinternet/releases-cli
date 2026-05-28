---
"@buildinternet/releases": minor
---

Tighten and enrich `releases get` output for products, orgs, and sources.

- **Products now show their latest releases inline.** A product card previously printed only metadata and pointed you at the org feed (which mixes sibling products) or a single source — an extra round-trip for the unit that's now primary. It now embeds a preview of the product's cross-source feed, matching what `get <org>` and `get <source>` already did, and the `--json` output gains a `releases` array.
- **Leaner cards.** The standalone type label ("Product" / "Organization" / "Source") and the separate ID / Slug / Org rows are folded into a single header line — `Name by OrgName (orgSlug/slug)` (orgs, having no parent, render `Name (slug)`). The "by Org" clause is dropped when the name already names the org, so App Store-style names like "Claude by Anthropic" don't double up. Empty fields (e.g. a missing URL) are omitted instead of printing a dash, and the typed ID moves to a dim trailing line.
- **Release rows lead with the title.** The feed description column now prefers the title family (AI headline → title) over the `summary`/content excerpt: feed surfaces often serve a raw content excerpt in `summary` when there's no curated AI summary yet, which buried the far more useful title (e.g. "Claude Design by Anthropic Labs" instead of "New Anthropic Labs product that lets you collaborate…"). Entity cards also drop the leading source column — the owning entity is already in the header — so the title gets full width and App Store rows stop repeating "Claude by Anthropic │ Claude by Anthropic 1.2…".
- **Clearer Next steps.** The product card's footer now leads with `releases latest --product <org/slug>` and a `--since 90d` variant, replacing an opaque "drill into one source" hint that pointed at an arbitrary first source by raw `src_` id. Org and source footers use the unified `latest` verb and note the `--since` window.
