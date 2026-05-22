# Releases CLI

[![npm](https://img.shields.io/npm/v/@buildinternet/releases?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@buildinternet/releases)
[![Release](https://github.com/buildinternet/releases-cli/actions/workflows/release.yml/badge.svg)](https://github.com/buildinternet/releases-cli/actions/workflows/release.yml)
[![Test](https://github.com/buildinternet/releases-cli/actions/workflows/test.yml/badge.svg)](https://github.com/buildinternet/releases-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![skills.sh](https://skills.sh/b/buildinternet/releases-cli)](https://skills.sh/buildinternet/releases-cli)

The changelog & release-notes registry for developers and AI agents. A lean HTTP client for [releases.sh](https://releases.sh) — search and browse release notes from GitHub, RSS/Atom/JSON feeds, and product changelog pages without any local infrastructure.

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

**Homebrew installs bash, zsh, and fish completions automatically** — nothing extra to do. For every other install path (npm, the `curl | bash` installer, and the raw GitHub binaries), enable completions once:

```bash
releases completion install          # auto-detects $SHELL
releases completion install zsh      # or pick explicitly
```

`install` writes to the conventional location (`~/.zsh/completions/_releases`, `~/.local/share/bash-completion/completions/releases`, or `~/.config/fish/completions/releases.fish`) and prints any rc-file lines you may need to add. The bash and fish paths honor `$XDG_DATA_HOME` and `$XDG_CONFIG_HOME` respectively, so the file lands wherever those point if set. Pass `--path <file>` to override the destination. To pipe the script somewhere yourself:

```bash
releases completion zsh > /path/to/_releases
```

On an interactive terminal, a persistent, self-resolving notice on the landing screen and `--help` reminds you to run this until shell completion is detected — and stops on its own once completions are set up (including the automatic Homebrew install). Set `RELEASES_NO_COMPLETION_HINT=1` to silence it.

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

### Claude Code plugins

This repo is a Claude Code marketplace named `releases` that publishes two plugins. Add the marketplace once, then install whichever surfaces you want:

```bash
/plugin marketplace add buildinternet/releases-cli

# Reader surface — search and look up releases:
/plugin install releases@releases

# Admin surface — onboard and maintain sources (requires admin API access):
/plugin install releases-admin@releases
```

Or point at a local clone for development:

```bash
claude --plugin-dir .
```

**`releases` (reader)** — for anyone querying the registry:

- **Hosted MCP connection** to `mcp.releases.sh` — search, lookup, and changelog slicing tools.
- **`/releases <product> [query]`** command for manual lookups.
- **Auto-trigger skills:**
  - `releases-mcp` — activates on questions about releases, changelogs, or breaking changes ("what's new in Next.js 15?").
  - `releases-cli` — activates when a user mentions or runs the `releases` CLI.
  - `analyzing-releases` — competitive intel across multiple companies.
  - `finding-changelogs` — discovering and evaluating changelog URLs.

**`releases-admin`** — for maintainers running their own registry or contributing back:

- **Agents** — `discovery` (finds and onboards sources) and `worker` (executes fetches).
- **Auto-trigger skills:**
  - `managing-sources` — CRUD on sources, ignored/blocked URLs, validation.
  - `parsing-changelogs` — fetch and parse pipeline reference.
  - `classify-media-relevance` — release-image classification helper.
  - `seeding-playbooks` — bulk playbook authoring across orgs.

> Claude Code plugins install atomically — there is no Claude Code–native flow for grabbing a single skill without the rest of the plugin. See the next section for an agent-neutral install path.

### Standalone skills (any agent)

The bundled skills are also available as a standalone package. The fastest way to install them is via the CLI:

```bash
releases skills install                       # detected agent, current project
releases skills install --global              # user-wide instead of project
releases skills install --agent cursor        # override detection
releases skills install releases-mcp          # just the user-facing lookup skill
```

This is a thin wrapper around the [`skills`](https://github.com/vercel-labs/skills) CLI from the open agent-skills ecosystem (`vercel-labs/skills`), which auto-detects ~50 supported agents (Claude Code, Codex, Cursor, OpenCode, Gemini CLI, Windsurf, GitHub Copilot, …) and writes to the right per-agent skills directory. If you'd rather skip the `releases` CLI entirely, the underlying command is:

```bash
npx skills add buildinternet/releases-cli
```

Use this path when you only want the skill behavior (auto-triggering on release/CLI questions) without also registering the hosted MCP connection, agents, and `/releases` command that the plugin provides. Skills are symlinked by default, so re-running `releases skills install` (or `npx skills update releases-cli`) refreshes everything atomically.

## Authentication

Admin commands require an API token. You can store one persistently using the `auth` command namespace so you don't need to set `RELEASED_API_KEY` in your shell every time.

```bash
releases auth login                     # interactive prompt (masked input)
releases auth login --token <token>     # pass directly
releases auth login --token -           # read from stdin (pipe-friendly)
```

The token is verified against `GET /v1/tokens/me` before being saved. If verification fails, nothing is written.

```bash
releases auth status                    # show current auth state
releases auth status --json             # machine-readable (authenticated, source, scopes, …)
releases auth status --verify           # re-check the token against the API live
releases auth token                     # print the raw token (for scripts)
releases auth logout                    # remove the stored token
```

`whoami` is an alias for `auth status`.

**Credential precedence:** if `RELEASED_API_KEY` is set in the environment it takes priority over any stored credential — useful for CI or per-command overrides.

**Storage:** credentials are written to `~/.releases/credentials` with `0600` permissions (owner read/write, rw-------). The file is JSON and contains the token, name, scopes, the API URL the token was verified against, and a `savedAt` timestamp.

## Environment

Nothing is required for reader access. For admin operations (closed beta — see above):

- `RELEASED_API_KEY` — Bearer token for write endpoints. Overrides any stored credential from `releases auth login`. Required for any `releases admin …` command that mutates state if no stored credential is present. Keys are not self-serve right now.
- `RELEASED_API_URL` — Override the default `https://api.releases.sh` endpoint (useful for staging).
- `RELEASED_TELEMETRY_DISABLED=1` — Opt out of anonymous usage pings. `DO_NOT_TRACK=1` is also honored.
- `RELEASES_DISABLE_SKILL_UPDATE_CHECK=1` — Silence the "skills are behind, run `releases skills install`" stderr nag that fires (at most once per 24h) when the GitHub `skills/` tree has moved since your last install.
- `RELEASES_RUN_DIR` — When set, every `releases admin …` write appends one JSONL line (`{timestamp, command, target, result}`) to `$RELEASES_RUN_DIR/mutations.jsonl` — an audit trail for agent-driven maintenance batches. Unset → no-op. Also the default destination for managed-session traces (`--trace-dir` / `--save` override it). Part of the `~/.releases/work/` maintenance workspace.

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
