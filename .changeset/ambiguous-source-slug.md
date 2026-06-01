---
"@buildinternet/releases": patch
---

Resolving a source by a **bare slug** (`admin source fetch`/`fetch-log`/`update`, the MCP `get_source` / `get_source_changelog` tools, and every other command that takes a source identifier) now errors and lists the matching `org/slug` + `src_…` candidates when that slug exists under more than one org, instead of silently resolving to the oldest match. Source slugs are unique per-org but not globally, so a bare `blog` could previously read from — or `update` could mutate — a source in the wrong org. Disambiguate with an `org/slug` coordinate or a `src_…` id (both already supported). Requires the API's `?slug=` source filter (releases#1323).
