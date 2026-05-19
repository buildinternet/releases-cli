# Releases plugins for Claude Code

Search changelogs, look up releases, and maintain sources in the [Releases.sh](https://releases.sh) registry from inside Claude Code.

This marketplace publishes two plugins for different audiences:

- **`releases`** — for anyone querying the registry. Bundles the hosted MCP connection, the `/releases` command, and skills that auto-trigger on release/changelog questions.
- **`releases-admin`** — for maintainers running or contributing to the registry. Bundles the `discovery` and `worker` agents plus operator playbook skills. Most workflows require an admin API key (closed beta — see the top-level README).

## Install

Add the marketplace once, then install whichever surfaces you want:

```bash
/plugin marketplace add buildinternet/releases-cli

# Reader surface — everyone:
/plugin install releases@releases

# Admin surface — maintainers (requires admin API access):
/plugin install releases-admin@releases
```

For local development against a cloned copy:

```bash
claude --plugin-dir <path-to-releases-cli-clone>
```

## `releases` (reader)

Everything you need to ask Claude about release notes and changelogs.

- **Hosted MCP connection** to `mcp.releases.sh` — search, lookup, and changelog slicing tools.
- **`/releases <product> [query]`** for manual lookups.
- **Auto-triggering skills:**
  - `releases-mcp` — activates on questions about releases, changelogs, breaking changes, or version updates ("what's new in Next.js 15?").
  - `releases-cli` — activates when a user mentions or runs the `releases` CLI.
  - `analyzing-releases` — competitive intel across multiple companies.
  - `finding-changelogs` — evaluating and onboarding new changelog URLs.

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

## `releases-admin` (maintainer)

For onboarding new sources, debugging the parse pipeline, and bulk maintenance.

- **Agents:**
  - `discovery` — finds and onboards changelog sources for a given organization.
  - `worker` — executes fetch operations across sources.
- **Auto-triggering skills:**
  - `managing-sources` — CRUD on indexed sources; covers ignored/blocked URLs and the validation workflow.
  - `parsing-changelogs` — fetch and parse pipeline reference; feed vs scrape adapters, crawl mode, dry-run testing.
  - `classify-media-relevance` — decides which release-page media to keep.
  - `seeding-playbooks` — bulk playbook authoring across many orgs via parallel sub-agents.

Try it after install:

```text
Use the discovery agent to onboard Stripe as a changelog source.
Use the worker agent to fetch all Vercel sources.
```

## Standalone skills (any agent)

If you want only the skill behaviour — no MCP connection, no command, no agents — install the bundled skills directly via the [`skills`](https://github.com/vercel-labs/skills) CLI from the open agent-skills ecosystem:

```bash
releases skills install                       # requires the `releases` CLI
npx skills add buildinternet/releases-cli     # equivalent, no CLI required
```

Skills are symlinked by default; re-running the install refreshes everything atomically.
