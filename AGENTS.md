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
- **`src/api/client.ts`** — single HTTP boundary. `apiFetch()` auto-attaches `Authorization: Bearer ${RELEASES_API_KEY}` when admin mode is active, and (via `src/lib/mutation-log.ts`) records mutating requests when `RELEASES_RUN_DIR` is set.
- **`src/lib/mode.ts`** — `getApiUrl()` / `getApiKey()` / `isAdminMode()` / `validateConfig()`. Always remote.
- **`src/lib/mutation-log.ts`** — admin-mutation audit log for the `~/.releases/work/` maintenance workspace. When `RELEASES_RUN_DIR` is set, each non-GET request (minus telemetry/heartbeat plumbing) appends a `{timestamp, command, target, result}` JSONL line to `$RELEASES_RUN_DIR/mutations.jsonl`. Unset → no-op; fully fail-open.
- **`src/lib/trace.ts`** — managed-session traces. Writes `<dir>/<id>/{trace.json,summary.md}` for terminal sessions/workflows; dir precedence is explicit flag > `RELEASES_RUN_DIR` > `~/.releases/work/runs`. Used by `--trace-dir` (onboard, `source fetch --wait`, `overview batch --wait`) and `task get --save`. `summary.md` mirrors the monorepo's `docs/architecture/maintenance-workspace.md` run-summary template.
- **`src/lib/telemetry.ts`** — anonymous usage pings to `api.releases.sh/v1/telemetry`. First-run notice shown once. Opt out via `RELEASES_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`.
- **`src/lib/update-check.ts`** — npm-registry poll for newer CLI versions (24h cache in `~/.releases/update-check.json`). Prints a one-line stderr nag after command output when stale. **`src/lib/skills-update-check.ts`** mirrors it for the bundled skills: GitHub `git/trees/main` poll for the `skills/` subtree SHA, cached in `~/.releases/skills-check.json`. Baseline is written on successful `releases skills install`; the nag fires only if a baseline exists and diverges. Defense in depth: when the `skills` CLI's lock file (`$XDG_STATE_HOME/skills/.skill-lock.json` or `~/.agents/.skill-lock.json`) is present and parses cleanly with zero `buildinternet/releases-cli` entries, the nag is suppressed (user uninstalled via `skills`). A missing/unreadable lock file falls through to the baseline check so manual installers aren't penalized. Opt out via `RELEASES_DISABLE_SKILL_UPDATE_CHECK=1`. Both checks skip non-TTY callers and `--help`/`--version`.
- **`src/mcp/server.ts`** — local stdio MCP bridge. Exposes read-only tools (`search_releases`, `get_latest_releases`, `list_sources`, `get_source`, `get_source_changelog`, `list_organizations`, `get_organization`, `list_products`, `get_product`) that proxy to `api.releases.sh`. Does NOT ship AI tools — use the hosted server at `mcp.releases.sh` for `summarize_changes` / `compare_products`.
- **`@buildinternet/releases-core`** — runtime-neutral helpers (schema, categories, slicing, IDs, slugs, tokens, CLI contracts). Published from the private [`buildinternet/releases`](https://github.com/buildinternet/releases) monorepo (canonical source in `packages/core/`), consumed here as a regular npm dependency. Bump the pin in `package.json` when adopting a new schema.
- **`packages/lib/`** (`@buildinternet/releases-lib`) — logger, errors, trimmed config.
- **`packages/skills/`** (`@buildinternet/releases-skills`) — thin wrapper around top-level `skills/` for consumers who want to load the bundled playbooks programmatically.
- **`skills/`** — source of truth for agent skills. The Claude plugin in `plugins/claude/releases/skills/` is generated via `bun scripts/sync-plugin-skills.ts`. Cross-agent install runs through `releases skills install`, which shells out to `npx skills add buildinternet/releases-cli` (the `vercel-labs/skills` ecosystem). Wiring is in `src/cli/commands/skills.ts`; pure argv construction in `src/cli/skills/build-args.ts`.
- **`plugins/claude/releases/`** — Claude Code plugin. Bundles the hosted MCP connection + synced skills.
- **`npm/`** — meta package (`@buildinternet/releases`) + four platform binary packages. CI writes the compiled binary into each platform package before publishing.

## Conventions

- All logging to **stderr** via `@releases/lib/logger`. stdout is reserved for MCP JSON-RPC in `admin mcp serve` mode and for `--json` command output.
- Reader commands (top-level `search`, `latest`, `list`, `show`, `stats`, `categories`) are unauthenticated GETs — safe to run without credentials. `summary` and `compare` are intentionally not in this CLI; they require AI provider calls and live in the private monorepo.
- Admin commands under `releases admin` are gated at CLI startup: missing `RELEASES_API_KEY` errors out before Commander dispatch.
- IDs over slugs everywhere. Every `<identifier>` arg accepts a typed ID (`org_…`, `src_…`, `prod_…`, `rel_…`), a bare slug, or — for sources and products — an `org/slug` coordinate (e.g. `vercel/vercel-ai-sdk`). `findSource(identifier)` / `findProduct(identifier)` in `src/api/client.ts` branch on shape: typed IDs hit the bare API path (still safe — IDs stay globally unique), `org/slug` is split locally and routed to `/v1/orgs/{org}/sources/{slug}`, bare slugs round-trip through `GET /v1/lookups/{source,product}-by-slug` to resolve a canonical home before fetching (#698). Bare slugs cost one extra round-trip per command; coordinate and typed-ID forms skip the resolver. Mutation helpers take a typed-ID-bearing entity object (`{ id }`) and POST/PATCH/DELETE against the bare path with the ID — see existing call sites in `cli/commands/{edit,product,release,remove}.ts`.
- `--json` supported on every reader command. Admin commands support it where it makes sense.
- The release readers (`get`, `search`, `tail`/`latest`) emit a **slim** JSON shape by default and accept `--full` for the complete payload — see `src/cli/render/release-json.ts` (`slimReleaseDetail` / `slimSearchHit` / `slimLatest`). The slim shape keeps `id`, `version`, `title`, `summary`, a markdown-stripped `excerpt`, `url`, `publishedAt`, nested `source`/`org`, and `contentChars`/`contentTokens`; it drops storage/pipeline internals (`contentHash`, `sourceId`, `versionSort`, `fetchedAt`, `embeddedAt`, `prerelease`, `composition`) and the redundant `title*` variants. Slim-by-default is deliberate — it's the agent token win. (`list` is the inverse: verbose default, opt-in `--compact`.) `--full` only affects `--json`; passing it without `--json` warns and is ignored.
- `--json` list responses return `{ items, pagination }` via the shared `ListResponse<T>` contract in `@buildinternet/releases-core/cli-contracts`. Pagination carries `{ page, pageSize, returned, hasMore }` plus `totalItems`/`totalPages` once the tail has been seen. When a default call returns a full page and more exists, the CLI also emits a stderr truncation warning so scripts don't silently miss rows. `metadata` fields are parsed into nested objects — don't call `JSON.parse` again. Use `parseMetadataField()` from the same module when adding new commands that surface metadata.
- Table rendering goes through `renderTable()` in `src/cli/render/table.ts` — borderless, two-space delimited, headers uppercased + cyan. In TTY mode it fits to `process.stdout.columns` (or the `COLUMNS` env override) using the gh-style three-pass column-width allocator: short flex columns get their natural width, long ones split the remainder, and any leftover redistributes back. Per-column `noTruncate: true` locks a column to its full natural width (use for IDs, dates, fixed-format fields); `alignRight: true` right-aligns numeric counts. In non-TTY mode (piped) output drops to bare TSV — no headers, no colors, no truncation — so `cut`/`awk` work cleanly. Don't reach for `cli-table3`; it was removed and the renderer covers the same surface without the broken-grid failure mode at narrow widths. `renderTable` also supports `showHeader: false` and per-row `subRows` (TTY-only continuation lines indented under column 1) — both used by the shared release renderer below.
- Release rows (`search` + `tail`/`latest`) render through `renderReleaseRows()` in `src/cli/render/releases-table.ts`, built on `renderTable`. It's a single aligned grid — identity (package-qualified version, else source name) · description · relative age · dimmed `rel_…` — with no header. `feed` mode uses the `releaseDescription` fallback chain (summary → titleShort → titleGenerated → content excerpt → title); `search` mode puts the title in the description column and adds a cleaned, markdown-stripped excerpt as an aligned `subRow` (dropped when it just repeats the title). Non-TTY stays bare TSV (`id`-first, ISO dates, version column) for pipelines. Pure helpers (`relativeDate`, `cleanExcerpt`, `releaseIdentity`, `releaseDescription`) live in `src/lib/release-display.ts`.
- `daysAgoIso()` from `@buildinternet/releases-core/dates` for cutoff math. Don't roll your own.
- Org overviews: `releases org get <identifier>` includes a short overview preview; `releases org overview <identifier>` is the unauthenticated public reader for the full body. Both accept the same identifier shapes as the rest of the CLI (typed `org_…` ID, slug, domain, name, or account handle). Both surfaces add a `⚠ older than 30 days` warning past `OVERVIEW_STALE_DAYS` (from `@buildinternet/releases-core/overview`).

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
