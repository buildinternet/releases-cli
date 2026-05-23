---
"@buildinternet/releases": patch
---

Reconcile the reader-facing skills (`releases-mcp`, `releases-cli`, `analyzing-releases`) with the live API surface. Removed references to tools/commands that don't exist (`summarize_changes`, `compare_products`, `get_source_changelog`, `manage_*`, `releases summary`/`compare`) and the deprecated `list_sources`/`list_products`/`search_releases` shims; documented the collections trio, `lookup_domain`, `agent-context`, and `since`/`until` time windows; and clarified that summarize/compare are agent-synthesized. Moved `finding-changelogs` to the operator (`releases-admin`) plugin since it's a key-gated curation workflow.
