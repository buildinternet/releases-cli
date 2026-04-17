# Releases CLI

Changelog registry for AI agents and developers. A lean HTTP client for [releases.sh](https://releases.sh) — search and browse release notes from GitHub, RSS/Atom/JSON feeds, and product changelog pages without any local infrastructure.

The CLI talks to the hosted registry at `api.releases.sh`. Reader commands work out of the box with no configuration; admin workflows require an API key.

## Install

### Homebrew (macOS / Linux)

```bash
brew install buildinternet/tap/releases
```

### npm

```bash
npm install -g @buildinternet/releases
```

Or run without installing:

```bash
npx @buildinternet/releases search "react"
```

### Shell installer

```bash
curl -fsSL https://releases.sh/install | bash
```

Downloads the matching platform binary from npm. Respects `RELEASED_INSTALL_DIR` (default: `/usr/local/bin`).

## Usage

```bash
releases search "authentication"
releases latest next-js
releases list --category ai
releases show vercel            # org, product, or source
releases stats
```

Every reader command supports `--json` for machine-readable output.

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

```bash
claude --plugin-dir plugins/claude/releases
```

The plugin ships the hosted MCP connection plus six bundled skills covering changelog discovery, parsing, and analysis workflows.

## Environment

Nothing is required for reader access. For admin operations:

- `RELEASED_API_KEY` — Bearer token for write endpoints. Required for any `releases admin …` command that mutates state.
- `RELEASED_API_URL` — Override the default `https://api.releases.sh` endpoint (useful for staging).
- `RELEASED_TELEMETRY_DISABLED=1` — Opt out of anonymous usage pings. `DO_NOT_TRACK=1` is also honored.

Copy `.env.example` to `.env` to configure these locally.

## Development

```bash
bun install
bun src/index.ts search "next"            # run from source
bun run build                             # compile binary to dist/releases
bun run typecheck                         # tsc --noEmit
bun test                                  # unit tests
```

The project is a Bun workspace. The three shared packages (`@buildinternet/releases-core`, `-lib`, `-skills`) are published from this repo alongside the CLI.

### Releasing

Changesets handle versioning:

```bash
bun run changeset           # write a bump entry for your PR
bun run changeset:version   # apply pending bumps (runs in CI)
bun run changeset:publish   # publish to npm (runs in CI)
```

The eight `@buildinternet/releases*` packages (5 binaries + 3 shared libraries) live in a fixed group so they bump together.

## License

MIT
