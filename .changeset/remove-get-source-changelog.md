---
"@buildinternet/releases": minor
---

Remove the deprecated `get_source_changelog` tool from the local stdio MCP bridge. It was deprecated in 0.71.0 in favor of `get_catalog_entry` with the `changelog_*` params (`include_changelog` / `changelog_path` / `changelog_offset` / `changelog_limit` / `changelog_tokens`); calling `get_source_changelog` by name now returns MCP's standard unknown-tool error. The REST helper `sourceChangelog()` is unchanged — `get_catalog_entry` and the `admin source changelog` CLI command still use it.
