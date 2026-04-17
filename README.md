# Releases CLI

Changelog registry for AI agents and developers. A lean HTTP client for [releases.sh](https://releases.sh) — search and browse release notes from GitHub, RSS/Atom/JSON feeds, and product changelog pages without any local infrastructure.

The CLI talks to the hosted registry at `api.releases.sh`. Reader commands work out of the box with no configuration.

> **Admin access is currently closed beta.** `releases admin …` commands require an API key, and API keys are not self-serve yet — the hosted registry doesn't expose a public signup flow for them. If you'd like early access, open an issue and we'll get in touch. Everything below the install section assumes reader-only use unless stated otherwise.

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

The bundled skills can be installed directly into any Claude Code / Codex / Cursor / OpenCode / etc. workspace using the [`skills`](https://github.com/vercel-labs/skills) CLI, which reads the top-level `skills/` directory of this repo:

```bash
# Browse the skills in this repo and pick interactively
npx skills add buildinternet/releases-cli

# Install a specific skill
npx skills add buildinternet/releases-cli --skill releases-cli
npx skills add buildinternet/releases-cli --skill releases-mcp

# Install all skills, globally, to Claude Code, no prompts
npx skills add buildinternet/releases-cli --skill '*' -g -a claude-code -y

# Update skills later (bare command updates everything installed)
npx skills update

# List installed skills
npx skills list
```

This path is useful when you only want the skill behavior (auto-triggering on release/CLI questions) without also registering the hosted MCP connection, agents, and `/releases` command that the plugin provides.

## Environment

Nothing is required for reader access. For admin operations (closed beta — see above):

- `RELEASED_API_KEY` — Bearer token for write endpoints. Required for any `releases admin …` command that mutates state. Keys are not self-serve right now.
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
