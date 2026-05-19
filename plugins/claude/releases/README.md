# Plugin assets

This directory holds the non-skill assets referenced by the Claude Code plugin manifests in [`.claude-plugin/marketplace.json`](../../../.claude-plugin/marketplace.json):

- [`agents/`](./agents) — `discovery` (finds and onboards sources) and `worker` (executes fetch operations). Bundled with the **`releases-admin`** plugin.
- [`commands/`](./commands) — `/releases <product> [query]` for manual changelog lookups. Bundled with the **`releases`** plugin.
- [`.mcp.json`](./.mcp.json) — hosted MCP connection to `mcp.releases.sh`. Bundled with the **`releases`** plugin.

Skills live at [`../../../skills/`](../../../skills) (top-level canonical), not here. The marketplace selects skill subsets by path — see `marketplace.json` for which skills land in which plugin.

For install instructions and an audience-level overview, see the [top-level README](../../../README.md#claude-code-plugins).
