---
"@buildinternet/releases": minor
---

Rework `search` / `tail`/`latest` human output and slim the default `--json`.

The human view for `search` and `tail`/`latest` is now a single column-aligned row per release (identity · description · relative age · dimmed `rel_…`); `search` adds a cleaned, markdown-stripped excerpt under each hit instead of dumping raw markdown. The piped (non-TTY) TSV path is fixed to one clean row per release.

`--json` now returns a lean release shape by default for `get` / `search` / `tail`/`latest` (`id`, `version`, `title`, `summary`, `excerpt`, `url`, `publishedAt`, nested `source`/`org`, `contentChars`, `contentTokens`); pass `--full` to recover the complete payload (`content`, `contentHash`, `versionSort`, `composition`, the `title*` variants, …). Scripts that read dropped fields should add `--full`.
