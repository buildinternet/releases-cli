---
"@buildinternet/releases": minor
"@buildinternet/releases-darwin-arm64": minor
"@buildinternet/releases-darwin-x64": minor
"@buildinternet/releases-linux-arm64": minor
"@buildinternet/releases-linux-x64": minor
"@buildinternet/releases-lib": minor
"@buildinternet/releases-skills": minor
---

**`releases admin playbook <org>` is back**

Ships the missing CLI wrapper for reading and updating an organization's playbook. Same shape as the old monorepo command, flattened from `admin content playbook` to `admin playbook` (no other live inhabitants of the `admin content` subgroup remain).

- `releases admin playbook <org>` — read the assembled playbook (header + agent notes)
- `releases admin playbook <org> --json` — JSON output
- `releases admin playbook <org> --notes "..."` — replace agent notes; seeds a fresh header on first write

The old `--regenerate` flag is not being ported. It called deterministic logic (no AI) that already runs automatically via `waitUntil` after every source add/edit/remove, and the `--notes` PATCH route auto-seeds a fresh header if no playbook exists yet.

Closes buildinternet/releases#246.
