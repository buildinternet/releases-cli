# Releases Plugin for Claude Code

Search changelogs, track releases, and manage changelog sources with the [Releases.sh](https://releases.sh) registry.

## What's Included

- **MCP Server** — Connects Claude Code to the Releases.sh changelog registry
- **Skills** — Auto-triggers that cover reader lookups (`releases-mcp`), terminal usage (`releases-cli`), and a suite of operator skills (`finding-changelogs`, `managing-sources`, `parsing-changelogs`, etc.) for anyone onboarding or managing sources
- **Agents** — `discovery` (finds and onboards sources) and `worker` (executes fetch operations)
- **Commands** — `/releases` for manual changelog queries

## Installation

Install via the marketplace manifest in the [releases-cli](https://github.com/buildinternet/releases-cli) repo:

```bash
/plugin marketplace add buildinternet/releases-cli
/plugin install releases@releases
```

For local development, point Claude Code at a cloned copy instead:

```bash
claude --plugin-dir plugins/claude/releases
```

## Available MCP Tools

### search_releases

Full-text search across all indexed release notes. Filter by product, organization, or release `type`.

### get_latest_releases

Get the most recent releases, optionally filtered by product, organization, or release `type`.

### list_sources

List all indexed changelog sources, optionally scoped to one organization.

### get_source

Detail for a single source including org/product linkage, release count, last-fetched timestamp, and whether a CHANGELOG file is stored.

### get_source_changelog

Return the canonical `CHANGELOG.md` (or `CHANGES`/`HISTORY`/`RELEASES`/`NEWS`) stored for a GitHub source. The file is refreshed on every fetch. Supports heading-aligned slicing by chars (`offset` + `limit`) or tokens (`tokens`, cl100k_base). Every response includes `totalTokens` for budget planning; token-mode calls also return `sliceTokens`. Chain successive calls via the returned `nextOffset` to page through large files without blowing out the context window. Recommended token brackets: 2000 / 5000 / 10000 / 20000.

### list_organizations

List all indexed organizations, with optional search.

### get_organization

Get detailed information about a single organization. Includes a short preview of the AI-generated overview when one exists, with a stale warning if it's older than 30 days.

### get_organization_overview

Read the full AI-generated overview for an organization — a short briefing that distills recent changelog activity into themed sections.

### list_products

List products, optionally scoped to one organization.

### get_product

Detail for a single product with its organization, category, tags, and the sources grouped under it.

## Usage Examples

The plugin works automatically when you ask about releases:

- "What changed in Next.js 15?"
- "Show me the latest Tailwind releases"
- "Compare Bun vs Deno release activity"

For manual lookups:

```
/releases next.js
/releases tailwind v4 breaking changes
```

For source management, spawn the agents:

```
Use the discovery agent to onboard Stripe as a changelog source
Use the worker agent to fetch all Vercel sources
```

## Bundled Skills

| Skill                      | Trigger                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `releases-mcp`             | User asks about recent releases, changelogs, breaking changes, or version updates ("what's new in Next.js 15?") |
| `releases-cli`             | User mentions the `releases` CLI, runs a `releases` command, or asks about installing or using the CLI          |
| `finding-changelogs`       | Adding a new source or evaluating a URL as a candidate                                                          |
| `managing-sources`         | Add/remove/edit/validate operations on indexed sources                                                          |
| `parsing-changelogs`       | Questions about how ingest works or debugging fetched content                                                   |
| `analyzing-releases`       | Cross-company trend or competitive-intel questions                                                              |
| `classify-media-relevance` | Deciding which images to keep on a release                                                                      |
| `seeding-playbooks`        | Bootstrapping ingestion notes for a new source                                                                  |

## Skill Sync

Skills are synced from the top-level `skills/` directory — do not edit them directly in the plugin directory. Run the sync:

```bash
bun scripts/sync-plugin-skills.ts
```
