# Contributing to Releases CLI

Thanks for your interest in contributing! This guide covers everything you need to build, test, and ship changes to the CLI and the packages it ships alongside (`@buildinternet/releases`, `@buildinternet/releases-lib`, `@buildinternet/releases-skills`).

The CLI is a thin HTTP client for [releases.sh](https://releases.sh). The backend, web frontend, MCP server, and discovery agents live in a separate (private) monorepo and ship through the hosted API.

## Setup

1. Fork and clone:

   ```bash
   git clone https://github.com/your-username/releases-cli.git
   cd releases-cli
   ```

2. Install [Bun](https://bun.sh) (the project uses Bun's package manager, test runner, and binary compiler — no npm/yarn/pnpm fallback path is supported).

3. Install dependencies:

   ```bash
   bun install
   ```

4. Run from source or build a binary:

   ```bash
   bun src/index.ts search "next"   # run from source
   bun run build                    # compile to dist/releases
   ```

The project is a Bun workspace. `@buildinternet/releases-lib` and `@buildinternet/releases-skills` are published from this repo alongside the CLI — those are open for direct contribution here.

A couple of dependencies come from the upstream backend monorepo:

- `@buildinternet/releases-core` — shared schema, helpers, and the FTS sanitizer.
- `@buildinternet/releases-api-types` — wire-protocol types served by `api.releases.sh`.

That monorepo is currently private (we plan to open-source it down the road), so those packages aren't open for direct PRs yet. If you hit a bug or need a missing field in either one, **open an issue here** describing what you need and we'll route it. In the meantime this repo just pins a published version and bumps when upstream cuts a release.

### Environment

Reader commands work against `https://api.releases.sh` out of the box. Admin commands need a bearer token — copy `.env.example` to `.env` and fill in:

- `RELEASES_API_KEY` — bearer token for write endpoints (closed beta; open an issue if you need access).
- `RELEASES_API_URL` — override the default endpoint (useful for staging).
- `RELEASES_TELEMETRY_DISABLED=1` — opt out of anonymous usage pings. `DO_NOT_TRACK=1` is also honored.

## Testing

Tests use Bun's built-in runner.

```bash
bun test                  # full suite
bun test tests/unit/      # pure-function tests
bun test tests/cli/       # command-level tests
bun test --watch          # re-run on file changes
bun run typecheck         # tsc --noEmit
```

Bug fixes and new features should include a test. When fixing a specific GitHub issue, leave a breadcrumb in the test:

```typescript
// https://github.com/buildinternet/releases-cli/issues/1234
it("respects --json on overview inputs subcommand", async () => {
  // ...
});
```

## Pull requests

### Commit and PR titles

PR titles follow [Conventional Commits](https://www.conventionalcommits.org/), with an optional scope:

```text
feat(cli): admin collection command tree
fix: respect --json on overview inputs subcommand
chore(deps): bump oxlint from 1.62.0 to 1.63.0
```

- Subject starts with a lowercase letter.
- Use `feat`, `fix`, `perf`, `docs`, `chore`, `refactor`, `test`.
- Append `!` for breaking changes (`feat(cli)!: ...`).
- Avoid sensational language ("comprehensive", "world-class", etc.) in titles and changelog entries.

### Changesets

Anything that ships in a published package needs a changeset:

```bash
bun run changeset
```

The CLI walks you through picking the affected packages, a bump type, and a short user-facing description. Commit the generated `.changeset/*.md` file with your PR.

A few things to know about how versioning works here:

- The eight `@buildinternet/releases*` packages (meta + 5 platform binaries + `-lib` + `-skills`) live in a **fixed group** — they bump together. Targeting any one of them in a changeset cascades to all eight.
- **Target `@buildinternet/releases`**, not `releases-cli`. The package isn't named `releases-cli` on npm.
- `@buildinternet/releases-core` is published from the private monorepo and is **not** in the fixed group — don't include it in a changeset here.

Pick the bump type by user impact:

- **`patch`** for bug fixes and additive changes existing users don't need to know about.
- **`minor`** for new commands, flags, or behavior changes worth surfacing.
- **`major`** for breaking changes (removed flags, renamed commands, exit-code changes).

Write the description for someone reading the changelog — describe what changed from a user's perspective, not how the code was refactored.

`bun run changeset:version` and `bun run changeset:publish` run in CI on merge to `main`; you don't need to run them locally.

### Submitting

1. Open a PR against `main`.
2. Describe what changed and why. Reference related issues (`Closes #123`).
3. Note any breaking changes explicitly.
4. CI runs typecheck, tests, and oxlint — keep them green.

## Issues

Search existing issues before opening a new one to avoid duplicates.

- **Bug reports** — include the CLI version (`releases --version`), the command you ran, what happened, and what you expected. A minimal reproduction is the fastest path to a fix.
- **Feature requests** — describe the problem first, then your proposed solution. For non-trivial features, opening an issue before writing code lets us align on shape.
- **Security** — do not open a public issue for security vulnerabilities. Use GitHub's [private vulnerability reporting](https://github.com/buildinternet/releases-cli/security/advisories/new) to report privately.

## AI-assisted contributions

AI-assisted code is welcome as long as it solves a real problem, follows the conventions above, and includes appropriate tests. Review what you submit closely enough to discuss it in review — PRs that look generated and untested will be closed.
