# @buildinternet/releases

## 0.25.0

### Minor Changes

- b2938c0: Add `releases agent-context` command that emits a versioned JSON document describing every command, argument, option, and exit code in the CLI.

  This is the L2 introspection layer described in the [10-principle agent-native CLI guide](https://trevinsays.com/p/10-principles-for-agent-native-clis): agents driving the CLI can answer questions like "does this flag accept stdin?" or "what commands are deprecated?" without spawning `--help` per command and parsing prose.

  The schema is generated at runtime by walking Commander's program tree — it stays automatically in sync with the implementation. `schemaVersion` is a string that bumps only on breaking field renames or removals; additive changes (new commands, new options, new fields) are silent.

- b94319a: Make `org create` and `source create` idempotent on retry. When a duplicate slug (org) or duplicate URL (source) is detected, the existing record is returned instead of erroring — exit code 0, JSON output gains an `existed: true` field. Pass `--strict` to restore the previous exit-1 behavior for callers that require hard failure on conflict.
- 3971251: Add `--limit <n>` / `--page <n>` pagination to four list commands and consume the
  `{ items, pagination }` envelope the API now returns for `/v1/orgs`,
  `/v1/admin/blocklist`, `/v1/orgs/:slug/ignored-urls`, and `/v1/sessions`
  (monorepo PR #723):
  - `releases org list`
  - `releases admin discovery task list`
  - `releases admin policy block list`
  - `releases admin policy ignore list`

  All four pass `?limit=&page=` through to the API and read the server's
  pagination metadata directly — no more client-side `Array.slice()`. Each prints
  a `warning: results may be truncated` message to stderr when more pages are
  available and no explicit `--limit` was supplied, mirroring `releases list`.
  Closes #105.

- a27f459: Adopt the `-` stdin convention in two more commands and tighten `--json` output safety on alias listings.
  - `releases import <file>` now accepts `-` for stdin (`cat manifest.json | releases import -`). Removes the temp-file dance for callers that generate manifests from another command.
  - `releases admin webhook verify --body-file <path>` now accepts `-` for stdin (`curl ... | releases admin webhook verify --secret ... --signature ... --body-file -`). Mirrors the convention already in `add --batch -` and `admin overview-write --content-file -`.
  - `org alias list --json` and `product alias list --json` now route through the drain-safe `writeJson()` helper instead of `console.log(JSON.stringify(...))`. Closes the small remaining surface area of the 96 KB pipe-truncation class first fixed in #33.

  Shared internal helper `readContentArg(pathOrDash)` lives in `src/lib/input.ts` for use by future file-or-stdin commands. No breaking changes — existing `--content-file <path>` / positional `<file>` invocations continue to work unchanged.

- 1821835: Rename CRUD verbs to standard create/get/update/delete equivalents. The old verb names (add, show, edit, remove) are retained as deprecated aliases that continue to work but print a deprecation warning to stderr. This affects top-level commands and all `org`, `product`, `source`, and `release` subcommands.

### Patch Changes

- f9eb1e2: Documents the exit-code taxonomy in README and root help output.

## 0.24.0

### Minor Changes

- 0c244f3: Adopt the org-scoped API path shape so the CLI keeps working after the monorepo rejects bare-slug source/product paths with 400 (#698).
  - `findSource(identifier)` and `findProduct(identifier)` now branch on the input shape: typed `src_…`/`prod_…` IDs hit the legacy bare path (still safe — IDs are globally unique), `org/slug` coordinates split into the org-scoped form, and bare slugs round-trip through the new `GET /v1/lookups/{source,product}-by-slug` resolver to pick a canonical home before fetching.
  - Mutation helpers (`updateSource`, `deleteSource`, `deleteSources`, `deleteReleasesForSource`, `insertReleasesBatch`, `checkContentHash`, `updateSourceMeta`, `updateProduct`) now take a typed-ID-bearing entity object instead of a slug string and target the bare path with `id`, which the API still accepts.
  - `getKnownReleasesForSource(identifier, …)` accepts the same identifier shapes as `findSource`.

  No CLI command surface changes — operators continue to type slugs, IDs, or `org/slug` coordinates wherever an identifier is accepted. The slug branch costs one extra round-trip to the lookup endpoint per command (cached aggressively at the network layer), which is the price for unambiguous resolution after #690 made slugs per-org.

- 2a775fb: `admin org delete --hard` now shows a cascade-scope preview and requires the user to type the org slug back to confirm. Backs the post-#690 Phase C schema, where hard-deleting an org now cascades into every source, release, fetch_log, changelog file/chunk, release summary, media asset, and webhook subscription tied to it (vs. orphaning sources via SET NULL pre-flip).
  - `releases admin org delete <slug> --hard` lists exact dependent counts, then waits for slug typeback. Wrong slug aborts with exit 1 and no API call to the destructive endpoint.
  - `--yes` / `-y` skips the prompt for scripted ops.
  - A piped (non-TTY) stdin without `--yes` exits 1 with a clear "no interactive TTY" message instead of silently auto-confirming.
  - Soft-delete (default, no `--hard`) is unchanged — still tombstones via `deleted_at`, no prompt.
  - `admin org remove` continues to work as an alias of `admin org delete`.

  Counts are pulled from the new `GET /v1/admin/orgs/:slug/dependents` endpoint, so the preview matches whatever the API would actually cascade-delete. Requires `@buildinternet/releases-api-types` ≥ 0.5.0 on the server side.

### Patch Changes

- 57cad43: Bump `@buildinternet/releases-api-types` to `^0.4.0`. Adds the optional `type: "feature" | "rollup"` field to release-shaped wire types (`ReleaseItem`, `ReleaseDetail`, `SearchReleaseHit`) so consumers can render rollup posts (Brex Fall Release, Ramp quarterly editions, etc.) differently from feature releases. Optional on the wire — older API responses degrade gracefully.

## 0.23.0

### Minor Changes

- c80aacb: feat(cli): publish a Windows x64 binary. `npm install -g @buildinternet/releases` now works on Windows; the dispatcher resolves `releases.exe` from the new `@buildinternet/releases-windows-x64` platform package. Homebrew remains macOS/Linux-only. `windows-arm64` is intentionally not shipped — open an issue if you need it.

## 0.22.1

### Patch Changes

- d61db7e: fix(cli): show full release IDs in `search`, `tail`, and the releases table. The previous 12-char prefix wasn't usable for any follow-up call (the API only resolves full IDs, not short forms), so the truncation was misleading without saving real horizontal space.

## 0.22.0

### Minor Changes

- 1901903: `webhook verify` now enforces a ±5 minute timestamp window by default to prevent replay-attack acceptance. Pass `--allow-stale` to skip the window check when verifying old captured payloads.

## 0.21.0

### Minor Changes

- de74c5f: Add on-demand lookup rendering to `releases search`. When the API returns a `lookup` payload (coordinate-shaped queries like `org/repo` that miss every curated entity), a new **Lookup** section prints before the regular results — covering all five outcomes (`indexed`, `existing`, `empty`, `not_found`, `deferred`) plus an inline release preview (up to 5) and a "Did you mean" rail when the org segment matches a curated org. The payload is also included in `--json` output. Bumps the `@buildinternet/releases-api-types` pin to `^0.3.0`.

## 0.20.2

### Patch Changes

- 4178044: Adopt the `catalog` rename in unified search responses (monorepo issue #539 follow-up). `releases search` now reads `response.catalog` and renders the section as **Catalog** in human and markdown output (it covered products + standalone sources already; the header now matches the wire field). `--type catalog` is the canonical filter; `--type products` is accepted as a deprecated alias. The deprecated `response.products` field is still read as a fallback so older API deploys keep working — that fallback can be dropped once the alias is removed from the wire. Plugin docs and the `releases-mcp` skill updated to point at the new `search` / `list_catalog` / `get_catalog_entry` MCP tools.
- ac4a443: Disable oxlint's `no-underscore-dangle` rule, surfaced by the 1.62 upgrade. The codebase deliberately uses leading-underscore identifiers for module-private state (`_dataDir`, `_apiUrl`, `_apiKey`, `_admin`); the rule's complaints aren't actionable. Keeps lint output clean and matches the same change in the monorepo for cross-repo consistency. CI-only; no runtime change.

## 0.20.1

### Patch Changes

- 24316b1: Move admin blocklist calls to `/v1/admin/blocklist` (was `/v1/blocked-urls`). The registry renamed the route to align with the `/v1/admin/...` convention; the old path is going away. Affects `releases admin block` / `unblock` and the `releases whoami` admin probe.

  Closes [registry #524](https://github.com/buildinternet/releases/issues/524).

- c0935e7: Add the `bun` ecosystem to the Dependabot config so npm dependency bumps land as weekly grouped PRs (production and dev separated). Pairs with the SHA-pinned GitHub Actions config — bun.lock already pins every package by sha512 integrity hash and CI runs with `--frozen-lockfile`, so this closes the loop on surfacing upstream drift. CI-only; no runtime behavior change.

## 0.20.0

### Minor Changes

- cb55e62: `releases admin source fetch` now accepts `--wait [seconds]`, blocking until the managed-agent session reaches a terminal state. Without `--wait` the command stays fire-and-forget. Default wait is 900s; pass an explicit value to shorten it (e.g. `--wait 60`).

  Exit codes:
  - `0` — session completed successfully
  - `1` — our-side error (no tools called, parser failure, timeout)
  - `2` — managed-agents/provider error (e.g. `unknown_error`, `model_overloaded_error`, retries exhausted) — the message is tagged `(managed-agents · <type>)` and includes retry count when the session ended in `retries_exhausted`
  - `130` — session cancelled

  Closes the silent-failure gap surfaced in [registry #590](https://github.com/buildinternet/releases/issues/590) where backend incidents bubbled up as `exit 0` even though no work happened.

- f0eab05: `releases admin overview-list` lists organizations with their overview status. Pass `--stale` to filter to orgs whose overviews need regeneration:

  ```
  releases admin overview-list --stale
  releases admin overview-list --stale --stale-min-releases 3 --stale-grace-days 14
  releases admin overview-list --stale --json
  ```

  An org is considered stale when `recentReleaseCount > minReleases` AND the overview is either missing or `lastActivity > overview.updatedAt + graceDays`. Defaults: `minReleases=5`, `graceDays=7`.

  The `--json` output carries `slug`, `name`, `recentReleaseCount`, `lastActivity`, `overviewUpdatedAt`, and `overviewMissing` — suitable for piping into the weekly regen routine (registry trigger `trig_012B14fpLS1inAkEuJTZBbnd`) which currently encodes this filter in its prompt.

  Closes [registry #590](https://github.com/buildinternet/releases/issues/590) item 6.

### Patch Changes

- ec6a649: Bump `@buildinternet/releases-api-types` to `^0.2.0`. The classification fields (`errorSource`, `errorType`, `stopReason`, `retryCount`) added by the registry to the `Session` shape now come straight from the published types, so the CLI's local `SessionWithClassification` extension is gone. No behavior change.
- 41b7a95: `releases admin overview-write` now accepts `--unescape-html`, which runs a small pre-upload pass to decode `&amp;`, `&lt;`, `&gt;`, `&quot;`, and `&#39;`. Useful when the markdown was generated by a sub-agent that escaped entities reflexively.

## 0.19.5

### Patch Changes

- 487ea5b: Replace the handwritten `src/api/types.ts` with a re-export from the newly-published `@buildinternet/releases-api-types` package. Eliminates drift between the CLI's wire-protocol types and the monorepo source.

  Additive fields now surfaced on `--json` output:
  - Source shapes gain `lastPolledAt`, `medianGapDays`, `lastRetieredAt`
  - New `ReleaseCoverageResponse` / `ReleaseCoverageRow` types for release coverage consumers
  - `SearchCatalogHit` is now the canonical name for catalog/product search hits (`SearchProductHit` remains as a deprecated alias)

## 0.19.4

### Patch Changes

- 31c2a64: Admin log routes moved under `/v1/admin/logs/*` on the API per issue #504 tier 3. The `releases admin source fetch-log` command and `getUsageStats` / `postUsageLog` / `postFetchLog` helpers are unchanged from the user's perspective, only the underlying URLs shift:
  - `GET /v1/fetch-log` → `GET /v1/admin/logs/fetch`
  - `POST /v1/fetch-log` → `POST /v1/admin/logs/fetch`
  - `GET /v1/usage-log/stats` → `GET /v1/admin/logs/usage/stats`
  - `POST /v1/usage-log` → `POST /v1/admin/logs/usage`

## 0.19.3

### Patch Changes

- 4f9ed94: Discovery triggers moved under `/v1/workflows/*` on the API per issue #504 tier 2. The `releases admin discovery onboard` and `releases admin fetch` commands are unchanged from the user's perspective, but the underlying URLs now follow the convention:
  - `POST /v1/discover` → `POST /v1/workflows/discover`
  - `POST /v1/update` → `POST /v1/workflows/update`
  - `GET /v1/discover/:sessionId` is gone — the CLI polls `GET /v1/sessions/:sessionId` instead, which reads from the same DO with a richer shape (progress fields live at the top level, not nested under `progress`).

- 1ef271f: Follow-up to the overview nesting: three more API surfaces moved under their parent resource.
  - Playbook: `getPlaybook(slug)` and `updatePlaybookNotes(slug, notes)` now call `/v1/orgs/:slug/playbook` and `/v1/orgs/:slug/playbook/notes`.
  - Summaries: `getSummariesForSource`, `upsertSummary`, and `getMonthlySummary` now call `/v1/sources/:slug/summaries`. `upsertSummary`'s signature changed from `(data)` (with `sourceId` in the body) to `(sourceSlugOrId, data)`.
  - Aliases: the `/v1/aliases` endpoints are gone. Domain aliases are now a `string[]` field on the parent — read via `/v1/orgs/:slug` or `/v1/products/:slug`, written via `PATCH { aliases: [...] }` on the parent. The CLI replaces `addDomainAlias`/`removeDomainAlias`/`listDomainAliases` with `getAliases(scope, slug)` and `setAliases(scope, slug, aliases)`. `releases org alias add|remove|list` and `releases product alias add|remove|list` commands are unchanged from the user's perspective.

  `/v1/knowledge` is also gone from the API. No CLI helper referenced it.

- 049528f: Overview admin commands now call the nested API routes (`/v1/orgs/:slug/overview`, `/v1/orgs/:slug/overview/inputs`, `/v1/products/:slug/overview`). The `releases admin overview-read`, `overview-write`, and `overview-inputs` commands are unchanged — only the URLs the CLI hits have moved.

  `OverviewInputs.selected` entries now carry pre-hydrated `content` (absolute CDN URLs) and a typed `media` array with `r2Url` resolved, so the overview agent can paste image URLs directly into generated markdown.

## 0.19.2

### Patch Changes

- fae0396: Send a distinctive `User-Agent` header (`releases-cli/<version> (+https://releases.sh)`) on every outbound HTTP request — registry API calls, `releases check` feed probes, update checks, telemetry. Replaces the previous fall-through to Bun/undici's default `node` UA so api.releases.sh analytics and third-party site operators can identify CLI traffic.

## 0.19.1

### Patch Changes

- caf3cdc: **Fix `releases admin embed {releases,entities,changelogs}` after monorepo route consolidation**

  The API worker moved the three embed-backfill triggers from `/v1/admin/embed/*` to `/v1/workflows/embed-*` in [buildinternet/releases#494](https://github.com/buildinternet/releases/issues/494). Without this bump, those three commands return `404` against the live API.

  Changes:
  - `embedReleases` now posts to `/v1/workflows/embed-releases`
  - `embedEntities` now posts to `/v1/workflows/embed-entities`
  - `embedChangelogs` now posts to `/v1/workflows/embed-changelogs`
  - `getEmbedStatus` stays on `/v1/admin/embed/status` (telemetry reads were not moved)

  The `releases admin embed …` command surface is unchanged — the path rename is invisible to users.

## 0.19.0

### Minor Changes

- e04effe: **Skills synced to the monorepo's consolidated tool surface**

  Mirrors the tool-UX consolidation from the monorepo (upstream issue [buildinternet/releases#459](https://github.com/buildinternet/releases/issues/459)). Deprecated per-action tool names are replaced with the consolidated equivalents across every skill that cited them.

  Typed-tool renames:
  - `add_source` / `edit_source` / `remove_source` / `fetch_source` → `manage_source` with `action: "add" | "edit" | "remove" | "fetch"`
  - `get_playbook` / `update_playbook_notes` → `manage_playbook` with `action: "get" | "update_notes"`
  - `list_categories` — retired; valid categories surface via `manage_org` / `manage_product` tool descriptions and system prompts

  Skill-specific changes:
  - `managing-sources` — Primary Sources section rewritten with conditional `is_primary` guidance, added a note about the slug auto-suffix behavior on `manage_source(action=add)`, ported the Organization Descriptions + Embedding Side Effects sections from upstream.
  - `seeding-playbooks` and `parsing-changelogs` — replaced the stale `releases admin content playbook` CLI path with `releases admin playbook` (the `content` subgroup was removed in #42).
  - `analyzing-releases` and `finding-changelogs` — call-site updates only.

  No CLI behavior changes.

## 0.18.0

### Minor Changes

- 254599f: feat(admin): add `overview`, `overview-inputs`, `overview-write` commands

  Restores the operator-side surface for AI overview regeneration after
  `@buildinternet/releases` deleted the local generator in #385. Pairs with the
  new server route `GET /v1/overview-inputs` and the existing dumb upsert at
  `POST /v1/overview`. Generation itself runs in Claude Code via the
  `regenerating-overviews` skill — no Anthropic client returns to the CLI.
  - `releases admin overview <slug>` — read the current overview
  - `releases admin overview-inputs <slug> --json [--window N]` — input-builder
  - `releases admin overview-write <slug> --content-file <path>` — upload result

## 0.17.0

### Minor Changes

- eaeb755: **`releases admin discovery evaluate <url>` is back**

  Ships the missing thin wrapper around `GET /v1/evaluate?url=...`, returning the AI-backed ingestion recommendation (method, feed URL, provider, confidence, alternatives). Supports `--json` for piping into `jq`. Mirrors the typed MCP `evaluate_url` tool.

  The legacy top-level alias `releases evaluate <url>` still resolves to this subcommand (with a deprecation warning).

  The stale `discover` entry in the legacy alias table has been removed — it pointed to a subcommand that never existed, and the API's `POST /v1/discover` is already covered by `releases admin discovery onboard`. The one in-repo docs reference has been updated.

- 51ec406: **`releases admin playbook <org>` is back**

  Ships the missing CLI wrapper for reading and updating an organization's playbook. Same shape as the old monorepo command, flattened from `admin content playbook` to `admin playbook` (no other live inhabitants of the `admin content` subgroup remain).
  - `releases admin playbook <org>` — read the assembled playbook (header + agent notes)
  - `releases admin playbook <org> --json` — JSON output
  - `releases admin playbook <org> --notes "..."` — replace agent notes; seeds a fresh header on first write

  The old `--regenerate` flag is not being ported. It called deterministic logic (no AI) that already runs automatically via `waitUntil` after every source add/edit/remove, and the `--notes` PATCH route auto-seeds a fresh header if no playbook exists yet.

  Closes buildinternet/releases#246.

## 0.16.1

### Patch Changes

- 8c3a579: Fix `--json` output being truncated at ~96 KB when piped to another process. All JSON output now awaits stdout `drain` before the CLI exits, so piping `releases admin source list --json | jq ...` works correctly on large datasets.

## 0.16.0

### Minor Changes

- 7e617c7: **CLI JSON contract: shared envelope, parsed metadata, truncation warnings**

  `releases list --json` now returns a consistent `{ items, pagination }` envelope whether or not `--limit` is passed, parses `metadata` into a nested object (no more `.metadata | fromjson?` in jq), and emits a stderr warning when results may be truncated.
  - **New shared types** in `@buildinternet/releases-core/cli-contracts`: `ListResponse<T>`, `Pagination`, `DEFAULT_PAGE_SIZE`, `computePagination()`, `parseMetadataField()`, `formatTruncationWarning()`. Single source of truth for the CLI's `--json` output shape.
  - **Default page size is now 500** (previously 100, the API's silent default) so a default `releases list --json` call returns 5× more rows before any risk of truncation. Explicit `--limit` still wins.
  - **Metadata fields are parsed** into nested objects in `--json` output for both the list view and single-source detail view.
  - **Stderr truncation warning** when no `--limit` was passed and `hasMore` is true — no more silent loss of rows.
  - **`--flat` flag** returns the legacy bare-array shape for scripts still tied to it. Not recommended; use the envelope.
  - **Server-side pagination** — `--limit` and `--page` are now passed through to the API instead of applied client-side to an already-truncated result set.

  Fixes buildinternet/releases-cli#24 (CLI side). An API-side follow-up will add an opt-in envelope response so `totalItems` can be populated for every page; until then `totalItems` is only set when the tail of the list is reached.

- 94e05dc: **Add `releases whoami` — mode, API URL, and auth diagnostic**

  New top-level command that reports how the CLI is configured:
  - Current CLI version
  - API URL and whether it's the default (`https://api.releases.sh`) or overridden via `RELEASED_API_URL`
  - Mode (`public` vs `admin`) based on whether `RELEASED_API_KEY` is set
  - Redacted API key hint (first 4 + last 4 characters) so users can confirm which key is active without leaking it
  - Optional `--check` flag that probes the API — a public read in public mode, an auth-gated read in admin mode, so an invalid key surfaces as a 401 instead of a silent success
  - `--json` flag for machine-readable output

### Patch Changes

- 2da36c8: **`releases list --json` now surfaces accurate `totalItems` on every page**

  The API's `?envelope=true` response is now consumed end-to-end: `totalItems`, `totalPages`, and `hasMore` are populated on the first page as well as the tail, instead of only when the final page is reached. The stderr truncation warning on the table view now uses the API-returned `hasMore` instead of inferring from `returned === pageSize` (which flagged spuriously when totalItems was an exact multiple of pageSize).
  - `listSourcesWithOrg({ envelope: true })` returns `ListResponse<SourceWithOrg>` via a typed overload; existing bare-array callers (`check`, MCP) are untouched.
  - Closes the loop opened by the API's envelope support (buildinternet/releases#356).

## 0.15.0

### Minor Changes

- 08b7297: Add `releases tail` as the canonical "latest releases" command (with `latest` retained as an alias), plus `-f/--follow` streaming mode:
  - `releases tail -f` polls the cached `/v1/releases/latest` endpoint on a 60-second interval (configurable with `--interval <seconds>`) and streams new releases as they arrive. Novelty detection is client-side via a bounded seen-id set, so every follow-poller collapses onto the shared KV cache entry rather than forking it with a per-client `since`.
  - `getLatestReleases` now calls the unified `/v1/releases/latest` endpoint in a single request. Replaces the previous scatter-gather (fetch `/sources`, call `/sources/:slug` for the first 10, sort locally), which sampled rather than enumerated and meant the CLI's "latest across all sources" was incomplete for indexes larger than 10 sources.
  - Extracted `renderLatestReleasesTable` into `src/cli/render/` so `tail` and `show` share one formatter.

  Requires the API worker to expose `GET /v1/releases/latest` (shipped in the monorepo alongside this change).

## 0.14.0

### Minor Changes

- 972ff89: Surface AI-generated org overviews more readily in the CLI:
  - `releases org show <slug>` now prints a short preview (first ~80 words) of the AI overview with a generated-at hint and a "⚠ older than 30 days" stale warning where appropriate.
  - New `releases org overview <slug>` command (public read, no auth) prints the full overview body with the same staleness signal.
  - `@buildinternet/releases-core/overview` exports shared helpers — `OVERVIEW_STALE_DAYS`, `overviewAgeDays`, `isOverviewStale`, `overviewPreview` — used by both the CLI and the upstream MCP server.

### Patch Changes

- f864aea: Include README in the published npm tarball so the package page on npmjs.com renders install + usage docs. A `prepack` script copies the repo-root README into the package directory at publish time.

## 0.13.2

### Patch Changes

- 3d4df61: Pin CI to bun canary to pick up oven-sh/bun#29272 — fixes `bun build --compile` producing Mach-O binaries that Apple Silicon SIGKILLs on exec due to a broken LC_CODE_SIGNATURE size in bun 1.3.12. Also leapfrogs the npm version timeline past the orphaned `@buildinternet/releases@0.13.0` left behind during the monorepo → OSS repo extraction.

## 0.12.1

### Patch Changes

- ef08acb: Bootstrap public tap distribution — first release cut from the extracted OSS repo. Publishes binaries to `buildinternet/releases-cli` GitHub Releases and regenerates the Homebrew formula at `buildinternet/homebrew-tap`.
