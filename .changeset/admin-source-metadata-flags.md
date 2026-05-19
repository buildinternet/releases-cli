---
"@buildinternet/releases": minor
---

Add `--metadata-set <key=value>` and `--metadata-unset <key>` flags to `releases admin source update`. Both are repeatable and thread through the existing `updateSourceMeta` client-side merge, so one-off source metadata patches (e.g. `--metadata-set crawlEnabled=true --metadata-set githubUrl=https://github.com/docker/compose`) no longer require custom scripts. Value coercion follows standard CLI conventions: `true`/`false`/`null` become JSON literals, finite number strings become numbers, values starting with `{` or `[` are parsed as JSON, and everything else is kept as a string.
