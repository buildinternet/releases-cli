# @buildinternet/releases-core

## 0.15.0

## 0.14.0

### Minor Changes

- 972ff89: Surface AI-generated org overviews more readily in the CLI:
  - `releases org show <slug>` now prints a short preview (first ~80 words) of the AI overview with a generated-at hint and a "⚠ older than 30 days" stale warning where appropriate.
  - New `releases org overview <slug>` command (public read, no auth) prints the full overview body with the same staleness signal.
  - `@buildinternet/releases-core/overview` exports shared helpers — `OVERVIEW_STALE_DAYS`, `overviewAgeDays`, `isOverviewStale`, `overviewPreview` — used by both the CLI and the upstream MCP server.

## 0.13.2

### Patch Changes

- 3d4df61: Pin CI to bun canary to pick up oven-sh/bun#29272 — fixes `bun build --compile` producing Mach-O binaries that Apple Silicon SIGKILLs on exec due to a broken LC_CODE_SIGNATURE size in bun 1.3.12. Also leapfrogs the npm version timeline past the orphaned `@buildinternet/releases@0.13.0` left behind during the monorepo → OSS repo extraction.

## 0.12.1

### Patch Changes

- ef08acb: Bootstrap public tap distribution — first release cut from the extracted OSS repo. Publishes binaries to `buildinternet/releases-cli` GitHub Releases and regenerates the Homebrew formula at `buildinternet/homebrew-tap`.
