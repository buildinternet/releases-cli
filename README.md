# Releases CLI

[![npm](https://img.shields.io/npm/v/@buildinternet/releases?color=cb3837&label=npm&logo=npm)](https://www.npmjs.com/package/@buildinternet/releases)
[![Release](https://github.com/buildinternet/releases-cli/actions/workflows/release.yml/badge.svg)](https://github.com/buildinternet/releases-cli/actions/workflows/release.yml)
[![Test](https://github.com/buildinternet/releases-cli/actions/workflows/test.yml/badge.svg)](https://github.com/buildinternet/releases-cli/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![skills.sh](https://skills.sh/b/buildinternet/releases-cli)](https://skills.sh/buildinternet/releases-cli)

The changelog & release-notes registry for developers and AI agents — a lean HTTP client for [releases.sh](https://releases.sh). Search and browse release notes from GitHub, RSS/Atom/JSON feeds, and product changelog pages, with no local infrastructure.

The CLI talks to the hosted registry at `api.releases.sh`. **Search and browse work out of the box — no account or config.** Sign in with `releases login` to follow orgs and products and get a personalized feed; it mints a personal **read-only** API key (and earns you higher rate limits as those roll out). Write/admin access (`releases admin …`) is a separate, closed beta — open an issue for early access.

## Install

```bash
brew install buildinternet/tap/releases          # Homebrew (macOS / Linux)
npm install -g @buildinternet/releases           # npm (macOS / Linux / Windows)
curl -fsSL https://releases.sh/install | bash    # shell installer (macOS / Linux)
```

Or run without installing: `npx @buildinternet/releases@latest search react` — always pin `@latest`, since bare `npx @buildinternet/releases` caches the first-fetched version forever. Signed, precompiled binaries for every platform are on the [Releases page](https://github.com/buildinternet/releases-cli/releases) (with checksums) for air-gapped installs or version pinning.

Homebrew installs shell completions automatically. On every other path, enable them once with `releases completion install` (auto-detects `$SHELL`).

## Usage

```bash
releases search "authentication"
releases search "slack integration" --since 90d   # bound release hits by publish date
releases tail next-js                              # latest releases; `tail -f` to follow
releases list --category ai
releases get vercel                                # org, product, or source
releases org overview vercel                       # full AI-generated org overview
releases stats
releases submit https://acme.dev/changelog         # suggest a source for the registry
releases feedback "great tool — here's an idea…"   # message the maintainers
```

Identifiers are interchangeable: every command accepts a slug, a typed ID (`org_…`, `prod_…`, `src_…`, `rel_…`), or an `org/slug` coordinate (e.g. `vercel/next-js`). IDs are stable across renames. `search`, `tail`/`latest`, and `feed` take `--since` / `--until` to bound releases by date — an ISO date (`2026-01-01`) or relative shorthand (`90d`, `4w`, `6m`, `2y`).

Add `--json` to any reader command for machine-readable output — list commands emit a `{ items, pagination }` envelope. Release readers return a slim shape by default (id, version, title, summary, excerpt, url, dates); pass `--full` for the complete payload. Run `releases <command> --help` for per-command flags.

### Following & personalized feed

Follow orgs and products to build a personalized feed. These act on your own account, so sign in first (`releases login`):

```bash
releases follow vercel              # org slug, org/product coordinate, or typed ID
releases following                  # list what you follow
releases feed                       # your release timeline (--json, --page, --limit)
releases unfollow vercel
```

Following an organization includes all of its products.

### Contribute to the registry

Neither needs an account or API key:

```bash
releases submit https://acme.dev/changelog       # suggest a changelog / release-notes URL
releases feedback "tail -f reconnects slowly"     # report a bug or share an idea
```

Both prompt interactively when run with no argument, accept input on stdin, and take `--dry-run --json` to preview the payload without sending. `feedback --type` is `bug` / `idea` / `other`; `submit --note` carries extra context (product name, repo, feed quirks). Submissions feed the same review queue as the [web submit form](https://releases.sh/submit).

### MCP & Claude Code

Point any MCP-compatible agent at the hosted server:

```bash
npx mcp-remote https://mcp.releases.sh/mcp
```

This repo is also a Claude Code marketplace with two plugins — `releases` (reader: hosted MCP tools, a `/releases` lookup command, and auto-trigger skills) and `releases-admin` (source onboarding + maintenance; needs admin access):

```bash
/plugin marketplace add buildinternet/releases-cli
/plugin install releases@releases          # reader
/plugin install releases-admin@releases    # admin
```

Or install just the skills into any agent (Cursor, Codex, Gemini CLI, Windsurf, …):

```bash
releases skills install        # or, without the CLI: npx skills add buildinternet/releases-cli
```

## Authentication

Search and browse need no auth. Signing in is what powers the personal touches — **following orgs/products and your customized feed** — and mints a personal **read-only** key (it can't write or administer anything; it just identifies you, and unlocks higher rate limits as those land). The easiest way in is your browser — nothing to copy or paste:

```bash
releases login              # opens your browser to approve, then saves the key
releases login --no-browser # print the URL + code to open yourself (headless / SSH)
```

This uses the OAuth 2.0 Device Authorization Grant (RFC 8628): approve a short code at [releases.sh/device](https://releases.sh/device) in a signed-in browser, and a read-only key is saved to `~/.releases/credentials` (`0600`). Manage keys with `releases keys list` / `create` / `revoke`.

Already issued a token (e.g. a write/admin key during the closed beta)? Store it without the browser flow via `releases auth login` (interactive, `--token <token>`, or `--token -` for stdin); it's verified before being saved. `releases auth status` shows the current state (`whoami` is an alias). `RELEASES_API_KEY` in the environment overrides any stored credential — handy for CI.

## Environment

Reader access requires nothing. Useful overrides:

- `RELEASES_API_KEY` — Bearer token for write endpoints; overrides stored credentials.
- `RELEASES_API_URL` — override the default `https://api.releases.sh` (e.g. staging).
- `RELEASES_TELEMETRY_DISABLED=1` — opt out of anonymous usage pings (`DO_NOT_TRACK=1` also honored).

See [`.env.example`](./.env.example) for the full list.

## Exit codes

| Code  | Meaning                                                      |
| ----- | ------------------------------------------------------------ |
| `0`   | Success                                                      |
| `1`   | Application error (network, API, unexpected state)           |
| `2`   | Usage / provider error (bad arguments or upstream rejection) |
| `130` | Cancellation (SIGINT)                                        |

## Contributing

Build, test, and release instructions live in [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
