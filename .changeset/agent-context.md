---
"@buildinternet/releases": minor
---

Add `releases agent-context` command that emits a versioned JSON document describing every command, argument, option, and exit code in the CLI.

This is the L2 introspection layer described in the [10-principle agent-native CLI guide](https://trevinsays.com/p/10-principles-for-agent-native-clis): agents driving the CLI can answer questions like "does this flag accept stdin?" or "what commands are deprecated?" without spawning `--help` per command and parsing prose.

The schema is generated at runtime by walking Commander's program tree — it stays automatically in sync with the implementation. `schemaVersion` is a string that bumps only on breaking field renames or removals; additive changes (new commands, new options, new fields) are silent.
