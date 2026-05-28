---
"@buildinternet/releases": minor
---

Add a keyless `releases submit <url>` command to suggest a changelog or release-notes source for the registry — the terminal peer of the web submit form. Accepts an optional `--note` and `--contact`, normalizes a missing scheme to `https://`, and supports interactive/stdin input plus `--dry-run`. Maintainers review the queue via the new `releases admin recommendations list/triage/archive/delete` verbs, mirroring the existing `admin feedback` triage surface.
