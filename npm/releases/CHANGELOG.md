# @buildinternet/releases

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
