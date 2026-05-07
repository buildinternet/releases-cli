---
"@buildinternet/releases": patch
---

Fix `releases admin overview inputs <org> --json` ignoring the flag and printing the chalk-formatted summary instead of JSON.

Root cause was a commander parsing quirk: the deprecated bare `overview <org>` form is registered with `.argument("[org]")` on the same `overview` command that hosts subcommands like `inputs`, `get`, `update`. Without positional option scoping, options that follow a subcommand's positional arg (`overview inputs google --json`) were being swallowed before the subcommand could see them. The same bug affected `--check --json` and silently dropped any subcommand option that appeared after the org slug.

Fixed by enabling `.enablePositionalOptions()` at the program level so each command's options are scoped to their own position. The deprecated `overview <org>` bare form still works.
