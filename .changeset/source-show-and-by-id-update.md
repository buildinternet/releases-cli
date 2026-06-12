---
"@buildinternet/releases": patch
---

Add `releases admin source show <src_…|org/slug|slug>` (alias `get`) to inspect a single source's config — type, fetch method, priority/paused state, last-fetch, and the metadata flags operators care about (render/crawl, feed URL, parse instructions, etc.). `--json` returns the source with parsed metadata instead of the raw JSON-in-JSON string. Previously the only way to read a source's config was to dump the whole org and filter the `sources` array by hand (#295).

Fix `source update <src_…> --json`: the JSON-refresh step re-resolved the source by its bare slug, so updating a source whose slug collides across orgs (e.g. `release-notes`) threw `AmbiguousSourceError` _after_ the update had already applied — even though the source was addressed by an unambiguous `src_…` id. The refresh now resolves through the typed id (#294).
