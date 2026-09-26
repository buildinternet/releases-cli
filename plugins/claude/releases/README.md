# Releases plugin for Claude Code

Search changelogs and look up releases in the [Releases.sh](https://releases.sh) registry from inside Claude Code.

## Install

Add the marketplace once, then install the plugin:

```bash
/plugin marketplace add buildinternet/releases-cli
/plugin install releases@releases
```

### Updates

The plugin has no pinned version, so every change merged to `main` counts as an update. Claude Code doesn't auto-update third-party marketplaces by default. To pick up new skills and commands:

- Turn on auto-update: `/plugin` → **Marketplaces** → `releases` → enable auto-update.
- Or update by hand. First refresh the marketplace listing with `/plugin marketplace update releases`. Then update the installed plugin with `claude plugin update releases@releases --scope user`, using the scope you installed with (`user`, `project` or `local`). Restart Claude Code to load the new version.

For local development against a cloned copy:

```bash
claude --plugin-dir <path-to-releases-cli-clone>/plugins/claude/releases
```

## What you get

Everything you need to ask Claude about release notes and changelogs.

- **Hosted MCP connection** to `agents.releases.sh` — search, lookup, and changelog slicing tools.
- **`/releases <product> [query]`** for manual lookups.
- **Auto-triggering skills:**
  - `releases-mcp` — activates on questions about releases, changelogs, breaking changes, or version updates ("what's new in Next.js 15?").
  - `releases-cli` — activates when a user mentions or runs the `releases` CLI.
  - `analyzing-releases` — competitive intel across multiple companies.

Try it after install:

```text
What changed in Next.js 15?
Show me the latest Tailwind releases.
Compare Bun vs Deno release activity.
```

Or run the command directly:

```text
/releases next.js
/releases tailwind v4 breaking changes
```

## Standalone skills (any agent)

If you want only the skill behaviour — no MCP connection, no command — install the bundled skills directly via the [`skills`](https://github.com/vercel-labs/skills) CLI from the open agent-skills ecosystem:

```bash
releases skills install                       # requires the `releases` CLI
npx skills add buildinternet/releases-cli     # equivalent, no CLI required
```

Skills are symlinked by default; re-running the install refreshes everything atomically.

## Looking for the operator surface?

Source onboarding, parse-pipeline debugging, and bulk maintenance are maintainer workflows that live with the backend in the [releases monorepo](https://github.com/buildinternet/releases) — its `.claude/skills/` tree is the canonical home for those skills and is picked up automatically by Claude Code in a checkout. (The former `releases-admin` plugin bundled snapshots of them here; those copies drifted and have been retired.)
