# @buildinternet/releases

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
