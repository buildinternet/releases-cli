---
name: releases-cli
description: Use the `releases` CLI to search, inspect, and manage the Releases.sh changelog registry from the terminal. Activate when the user mentions "releases CLI", runs a `releases` command, asks how to install the CLI, or wants to add/edit/fetch sources or organizations programmatically.
---

<!-- AUTO-GENERATED: Do not edit directly. Source of truth is skills/. Changes here will be overwritten by scripts/sync-plugin-skills.ts -->


# releases CLI

The `releases` CLI does two things: lets anyone search and browse the public changelog registry at [releases.sh](https://releases.sh), and lets API-key holders manage orgs, products, sources, and releases through `releases admin` subcommands.

## Install

```bash
brew install buildinternet/tap/releases    # recommended on macOS / Linux
npm install -g @buildinternet/releases     # or via npm
```

Or run one-off without installing:

```bash
npx @buildinternet/releases search "react"
```

The CLI talks to `api.releases.sh` by default — no configuration needed for reader commands.

## What this skill covers

- **[Reader commands](references/reader.md)** — Search, inspect, and export changelog data. No API key required.
- **[Admin commands](references/admin.md)** — Add/edit sources, manage orgs and products, fetch releases, run policies. Requires `RELEASED_API_KEY`.

## Quick Reference

```bash
# Reader (no auth required)
releases search "breaking change"               # hybrid FTS + semantic search
releases tail next-js                           # latest releases from one source
releases tail src_abc123                        # IDs work anywhere a slug does
releases tail --org vercel --count 20           # latest from a whole org
releases list --category ai                     # browse sources
releases get vercel                             # dispatch by id or slug
releases get org_abc123                         # typed IDs are accepted
releases stats                                  # registry overview
releases categories                             # list valid category values

# Admin (requires RELEASED_API_KEY)
releases admin source create "Linear" --url https://linear.app/changelog
releases admin source fetch <source> --max 50   # source = src_… or slug
releases admin org create "Acme" --category cloud
releases admin product create "CLI" --org acme  # --org accepts org_…, slug, domain, name, or handle
releases admin discovery onboard "Stripe"       # AI-powered discovery agent

# Local stdio MCP bridge (proxies to api.releases.sh)
releases admin mcp serve
```

Every command that takes an org / product / source / release identifier accepts the typed ID (`org_…`, `prod_…`, `src_…`, `rel_…`) interchangeably with the slug — including `--org`, `--product`, `--source` flags. IDs are stable across renames; slugs are friendlier to type. Source and product commands also accept an `org/slug` coordinate (e.g. `vercel/vercel-ai-sdk`); coordinates and typed IDs are unambiguous and skip an extra resolver round-trip that bare slugs require. Every reader command accepts `--json` for machine-readable output.

## Authentication

Reader access is unauthenticated and may be rate-limited per IP.

**Admin access is closed beta.** `releases admin …` commands require a Bearer token, but the hosted registry does not currently expose a self-serve flow for generating keys — an external user cannot create one on their own. If the user asks how to get an API key, explain this and point them at the project repo to request access. Don't invent a signup URL.

If a key is available:

```bash
export RELEASED_API_KEY=your_key
export RELEASED_API_URL=https://api.releases.sh   # optional, this is the default
```

These can also go in a `.env` file — Bun auto-loads it when running from source.

## Common Mistakes

- `releases admin …` without `RELEASED_API_KEY` set fails fast with a clear error — don't retry the same command. Note that keys are not self-serve yet (see Authentication).
- Slug renames (`admin source update <identifier> --slug new-slug`) require `--confirm-slug-change` because they break web links.
- `releases admin source fetch` with no source or filter is blocked in remote mode. Use `--stale`, `--unfetched`, `--retry-errors`, `--changed`, or a source identifier (src_… or slug).
- Default fetch cap is 200 releases per source (GitHub pagination limits). Use `--max <n>` or `--all` to override.
- `summary` and `compare` are *not* in this CLI. Those commands require AI provider calls and live in the private maintainer tooling. Use the hosted MCP tools `summarize_changes` / `compare_products` at `mcp.releases.sh` instead.
