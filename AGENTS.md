# Agents guide — releases-cli

This repo is the public, client-only CLI for the Releases registry. It talks to `api.releases.sh` over HTTP. Ingest, database access, and AI pipelines live in a separate private repo.

## Stack

- **Runtime:** Bun (required for `bun --compile`)
- **Language:** TypeScript (strict mode)
- **CLI:** Commander
- **MCP:** `@modelcontextprotocol/sdk` on stdio
- **HTTP client:** `src/api/client.ts` is the only data-access layer. No Drizzle, no SQLite, no local DB.

## Commands

```bash
bun src/index.ts <command>    # run from source
bun run build                 # compile binary to dist/releases
bun run typecheck             # tsc --noEmit
bun test                      # bun test
```

## Architecture

- **`src/index.ts`** — entry point. Validates config, sets up telemetry, rewrites legacy aliases, hands off to Commander.
- **`src/cli/program.ts`** — Commander program wiring. Public reader commands at the top level; operator workflows under `admin`.
- **`src/cli/commands/`** — one file per command. Every command goes through `src/api/client.ts` for data access.
- **`src/api/client.ts`** — single HTTP boundary. `apiFetch()` auto-attaches `Authorization: Bearer ${RELEASED_API_KEY}` when admin mode is active.
- **`src/lib/mode.ts`** — `getApiUrl()` / `getApiKey()` / `isAdminMode()` / `validateConfig()`. Always remote.
- **`src/lib/telemetry.ts`** — anonymous usage pings to `api.releases.sh/v1/telemetry`. First-run notice shown once. Opt out via `RELEASED_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`.
- **`src/mcp/server.ts`** — local stdio MCP bridge. Exposes read-only tools (`search_releases`, `get_latest_releases`, `list_sources`, `get_source`, `get_source_changelog`, `list_organizations`, `get_organization`, `list_products`, `get_product`) that proxy to `api.releases.sh`. Does NOT ship AI tools — use the hosted server at `mcp.releases.sh` for `summarize_changes` / `compare_products`.
- **`@buildinternet/releases-core`** — runtime-neutral helpers (schema, categories, slicing, IDs, slugs, tokens, CLI contracts). Published from the private [`buildinternet/releases`](https://github.com/buildinternet/releases) monorepo (canonical source in `packages/core/`), consumed here as a regular npm dependency. Bump the pin in `package.json` when adopting a new schema.
- **`packages/lib/`** (`@buildinternet/releases-lib`) — logger, errors, trimmed config.
- **`packages/skills/`** (`@buildinternet/releases-skills`) — thin wrapper around top-level `skills/` for consumers who want to load the bundled playbooks programmatically.
- **`skills/`** — source of truth for agent skills. The Claude plugin in `plugins/claude/releases/skills/` is generated via `bun scripts/sync-plugin-skills.ts`.
- **`plugins/claude/releases/`** — Claude Code plugin. Bundles the hosted MCP connection + synced skills.
- **`npm/`** — meta package (`@buildinternet/releases`) + four platform binary packages. CI writes the compiled binary into each platform package before publishing.

## Conventions

- All logging to **stderr** via `@releases/lib/logger`. stdout is reserved for MCP JSON-RPC in `admin mcp serve` mode and for `--json` command output.
- Reader commands (top-level `search`, `latest`, `list`, `show`, `stats`, `categories`) are unauthenticated GETs — safe to run without credentials. `summary` and `compare` are intentionally not in this CLI; they require AI provider calls and live in the private monorepo.
- Admin commands under `releases admin` are gated at CLI startup: missing `RELEASED_API_KEY` errors out before Commander dispatch.
- IDs over slugs everywhere. Every `<identifier>` arg accepts `org_…`, `src_…`, `prod_…`, `rel_…`, or a slug.
- `--json` supported on every reader command. Admin commands support it where it makes sense.
- `--json` list responses return `{ items, pagination }` via the shared `ListResponse<T>` contract in `@buildinternet/releases-core/cli-contracts`. Pagination carries `{ page, pageSize, returned, hasMore }` plus `totalItems`/`totalPages` once the tail has been seen. When a default call returns a full page and more exists, the CLI also emits a stderr truncation warning so scripts don't silently miss rows. `metadata` fields are parsed into nested objects — don't call `JSON.parse` again. Use `parseMetadataField()` from the same module when adding new commands that surface metadata.
- `daysAgoIso()` from `@buildinternet/releases-core/dates` for cutoff math. Don't roll your own.
- Org overviews: `releases org show <slug>` includes a short overview preview; `releases org overview <slug>` is the unauthenticated public reader for the full body. Both surfaces add a `⚠ older than 30 days` warning past `OVERVIEW_STALE_DAYS` (from `@buildinternet/releases-core/overview`).

## Telemetry

The CLI sends anonymous pings (command name, duration, exit code, CLI version, OS, arch) to `api.releases.sh/v1/telemetry`. No arguments, paths, slugs, or content are included. The code lives at `src/lib/telemetry.ts`. First run prints a one-line notice and persists a marker file at `~/.releases/telemetry-notice-shown`.

## Releasing

**Every PR with user-visible changes MUST ship a `.changeset/*.md` file.** Run `bun changeset` (interactive) or write the file directly in `.changeset/`. Bump level: `patch` for bug fixes, `minor` for additive features, `major` for breaking changes. The seven fixed-group packages below must all appear in the changeset header — `bun changeset` selects them together; if writing by hand, copy the header from a prior changeset in git history.

**Never hand-edit a `version` field.** Not in the root `package.json`, not in `npm/*/package.json`, not in `packages/*/package.json`, and not in `src/cli/version.ts`. The release pipeline owns all of them — `changeset version` updates the package files, and `scripts/sync-version.ts` mirrors the result into `src/cli/version.ts`. The MCP server re-exports that constant (`src/mcp/server.ts` imports `VERSION` from `../cli/version.js`), so there's no separate string to sync.

Changesets versions seven `@buildinternet/releases*` packages together (fixed group):

- `@buildinternet/releases` — meta package
- `@buildinternet/releases-{darwin-arm64,darwin-x64,linux-arm64,linux-x64}` — platform binaries
- `@buildinternet/releases-{lib,skills}` — shared libraries

`@buildinternet/releases-core` is published independently from the monorepo and consumed here as a regular npm dependency — bump its pin in `package.json` when adopting a new schema. It is **not** part of the fixed group.

On merge to `main`, `.github/workflows/release.yml` opens or updates a `chore: version packages` PR. Merging that PR re-runs the workflow, publishes to npm, and cuts a GitHub release with the platform binaries attached.

## What's NOT in this repo

Anything that touches a database, AI provider, or crawl infrastructure stays in the private monorepo:

- `src/db/`, `src/ai/`, `src/adapters/` — ingest engine and DB queries
- `workers/` — Cloudflare API, MCP, and discovery workers
- `web/` — the public catalog
- Managed agent config and deploy scripts

The OSS CLI is a pure HTTP client. If a feature requires local Anthropic/Cloudflare calls, it lives in the private repo.
