# Releases CLI

[![npm](https://img.shields.io/npm/v/@buildinternet/releases?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@buildinternet/releases)
[![Release](https://github.com/buildinternet/releases-cli/actions/workflows/release.yml/badge.svg)](https://github.com/buildinternet/releases-cli/actions/workflows/release.yml)
[![Test](https://github.com/buildinternet/releases-cli/actions/workflows/test.yml/badge.svg)](https://github.com/buildinternet/releases-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)

Changelog registry for AI agents and developers. A lean HTTP client for [releases.sh](https://releases.sh) — search and browse release notes from GitHub, RSS/Atom/JSON feeds, and product changelog pages without any local infrastructure.

The CLI talks to the hosted registry at `api.releases.sh`. Reader commands work out of the box with no configuration.

> **Admin access is currently closed beta.** `releases admin …` commands require an API key, and API keys are not self-serve yet — the hosted registry doesn't expose a public signup flow for them. If you'd like early access, open an issue and we'll get in touch. Everything below the install section assumes reader-only use unless stated otherwise.

## Install

### Homebrew (macOS / Linux)

```bash
brew install buildinternet/tap/releases
```

### npm (macOS, Linux, Windows)

```bash
npm install -g @buildinternet/releases
```

Or run without installing:

```bash
npx @buildinternet/releases@latest search "react"
```

Always include the `@latest` tag — bare `npx @buildinternet/releases` caches the first-fetched version forever and won't pick up updates.

### Shell installer (macOS, Linux)

```bash
curl -fsSL https://releases.sh/install | bash
```

Downloads the matching platform binary from npm. Respects `RELEASED_INSTALL_DIR` (default: `/usr/local/bin`). Windows users should use npm or the GitHub Releases archive below.

### Precompiled binaries (GitHub Releases)

Every version publishes signed archives for each platform on the [Releases page](https://github.com/buildinternet/releases-cli/releases) — `releases-{darwin-arm64,darwin-x64,linux-arm64,linux-x64}.gz` and `releases-windows-x64.zip`, each with a matching `.sha256` and a top-level `checksums.txt`. Useful for air-gapped installs, version pinning, or platforms where npm and Homebrew aren't an option.

### Shell completion

Once the matching tap formula update rolls out, Homebrew will install bash, zsh, and fish completions automatically. Until then, and for all non-Homebrew install paths, run:

```bash
releases completion install          # auto-detects $SHELL
releases completion install zsh      # or pick explicitly
```

`install` writes to the conventional location (`~/.zsh/completions/_releases`, `~/.local/share/bash-completion/completions/releases`, or `~/.config/fish/completions/releases.fish`) and prints any rc-file lines you may need to add. The bash and fish paths honor `$XDG_DATA_HOME` and `$XDG_CONFIG_HOME` respectively, so the file lands wherever those point if set. Pass `--path <file>` to override the destination. To pipe the script somewhere yourself:

```bash
releases completion zsh > /path/to/_releases
```

Set `RELEASES_NO_COMPLETION_HINT=1` to silence the first-run completion hint.

## Usage

```bash
releases search "authentication"
releases tail next-js                    # or `releases tail -f` to follow new releases
releases tail src_abc123                 # IDs work everywhere a slug does
releases list --category ai
releases get vercel                      # org, product, or source
releases get org_abc123                  # typed IDs are accepted
releases org overview vercel             # full AI-generated overview for an org
releases stats
```

Every command that takes an org / product / source / release identifier accepts the typed ID form (`org_…`, `prod_…`, `src_…`, `rel_…`) interchangeably with the slug. IDs are stable across renames; slugs are friendlier when typing. Sources and products also accept the `org/slug` coordinate form (e.g. `vercel/next-js`).

Every reader command supports `--json` for machine-readable output. List commands emit a `{ items, pagination }` envelope — parse with `jq '.items[]'`, and check `.pagination.hasMore` before assuming you've seen every row. Nested `metadata` fields are returned as parsed objects (no `fromjson` needed). `org get` includes a short overview preview (with a stale warning when more than 30 days old); `org overview <identifier>` prints the full body.

Tabular reader commands fit themselves to the terminal width when stdout is a TTY (column truncation with `…`) and switch to bare TSV when piped — no headers, no color, no truncation — so `releases org list | cut -f2` works without parsing ANSI. `COLUMNS=<n>` overrides the detected width. For complete, parseable output prefer `--json`.

### MCP

Point Claude Code (or any MCP-compatible agent) at the hosted MCP server:

```bash
npx mcp-remote https://mcp.releases.sh/mcp
```

Or run a local stdio bridge that proxies the same tools to `api.releases.sh`:

```bash
releases admin mcp serve
```

### Claude Code plugin

Install from the marketplace manifest in this repo:

```bash
/plugin marketplace add buildinternet/releases-cli
/plugin install releases@releases
```

Or point at a local clone for development:

```bash
claude --plugin-dir plugins/claude/releases
```

The plugin bundles:

- **Hosted MCP connection** to `mcp.releases.sh` — search, lookup, and changelog slicing tools.
- **Auto-trigger skills**:
  - `releases-mcp` — activates on user questions about releases, changelogs, or breaking changes ("what's new in Next.js 15?").
  - `releases-cli` — activates when a user mentions or runs the `releases` CLI.
  - `finding-changelogs`, `managing-sources`, `parsing-changelogs`, `analyzing-releases`, `classify-media-relevance`, `seeding-playbooks` — operator playbooks for onboarding and maintaining sources (admin access required to act on them — see the callout at the top of this README).
- **Agents** — `discovery` (finds and onboards sources) and `worker` (executes fetches).
- **Commands** — `/releases <product> [query]` for manual lookups.

> Claude Code plugins install atomically — there is no Claude Code–native flow for grabbing a single skill without the rest of the plugin. See the next section for an agent-neutral install path.

### Standalone skills (any agent)

The bundled skills are also available as a standalone package. Install them into any Claude Code / Codex / Cursor / OpenCode workspace using the [`skills`](https://github.com/vercel-labs/skills) CLI, which reads the top-level `skills/` directory of this repo:

```bash
npx skills add buildinternet/releases-cli
```

Use this when you only want the skill behavior (auto-triggering on release/CLI questions) without also registering the hosted MCP connection, agents, and `/releases` command that the plugin provides.

## Environment

Nothing is required for reader access. For admin operations (closed beta — see above):

- `RELEASED_API_KEY` — Bearer token for write endpoints. Required for any `releases admin …` command that mutates state. Keys are not self-serve right now.
- `RELEASED_API_URL` — Override the default `https://api.releases.sh` endpoint (useful for staging).
- `RELEASED_TELEMETRY_DISABLED=1` — Opt out of anonymous usage pings. `DO_NOT_TRACK=1` is also honored.

Copy `.env.example` to `.env` to configure these locally.

## Contributing

Build, test, and release instructions live in [CONTRIBUTING.md](CONTRIBUTING.md).

## Exit codes

| Code  | Meaning                                                                          |
| ----- | -------------------------------------------------------------------------------- |
| `0`   | Success — session completed or command finished cleanly                          |
| `1`   | Application error — our-side failure (network, API, unexpected state)            |
| `2`   | Usage / provider error — bad arguments or upstream provider rejected the request |
| `130` | Cancellation — session was cancelled (mirrors the SIGINT convention)             |

Defined in [`src/cli/commands/fetch-wait.ts`](./src/cli/commands/fetch-wait.ts) (`TerminalSummary.exitCode`).

## License

MIT
