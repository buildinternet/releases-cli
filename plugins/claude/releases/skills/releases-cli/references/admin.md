# Admin Commands

> **Closed beta.** All commands on this page require `RELEASED_API_KEY` — a Bearer token on write endpoints of `api.releases.sh`. API keys are **not self-serve** at this time. A normal user cannot create one on their own, and the hosted registry does not expose a public signup flow for admin access. If a user asks how to obtain a key, tell them admin access is currently invite-only and point them at the project repo to request access. Do not fabricate a signup URL or recommend sending a request to a specific email unless one is documented in this repo.

If a key is available, set it in the environment:

```bash
export RELEASED_API_KEY=your_key
```

Missing or invalid keys fail fast at CLI startup with a clear error; don't retry the same command without fixing the env var.

All admin commands accept an entity ID (`org_…`, `src_…`, `prod_…`, `rel_…`) or a slug wherever an identifier is expected. Source and product commands also accept an `org/slug` coordinate (e.g. `vercel/vercel-ai-sdk`). Prefer IDs or coordinates — slugs can change, IDs cannot, and coordinates typically skip an extra resolver round-trip that bare slugs require under the hood (#698).

### Previewing changes (`--dry-run`)

All mutating admin verbs accept `--dry-run`. The command resolves identifiers, runs validation (category, URL exclusion, existing-record dedup, etc.), and prints the planned write without calling the API. Combine with `--json` for a machine-readable plan. Coverage: `source create / update / delete / import`, `org create / update / delete / link / unlink`, `product create / update / delete / adopt`, `release update / delete / suppress / unsuppress`, `policy ignore add/remove`, `policy block add/remove`, `embed` write paths, `org refresh`. Tag and alias add/remove on org/product are intentionally left without a preview — they're trivially reversible joins.

## Sources

### Create

```bash
releases admin source create "Next.js" --url https://github.com/vercel/next.js
releases admin source create "Linear" --url https://linear.app/changelog
releases admin source create "My Blog" --url https://example.com/changelog
releases admin source create "Linear" --url https://linear.app/changelog --dry-run --json
```

`--dry-run` still runs the URL dedup and exclusion checks (so you'll see "already exists" or "blocked URL" outcomes), but skips the write — including the auto-create-org side effect when `--org <name>` doesn't resolve.

By default, `create` runs automated pre-checks (provider detection, feed discovery, markdown probing). Override with `--type github|scrape|feed|agent`. Batch mode (`--batch`) skips evaluation by default for speed.

Provide a feed URL explicitly when it isn't easily discoverable:

```bash
releases admin source create "Claude Code" --url https://docs.anthropic.com/en/changelog \
  --feed-url https://docs.anthropic.com/en/changelog/rss.xml
```

Evaluate without adding:

```bash
releases admin discovery evaluate https://linear.app/changelog
```

### Update

```bash
releases admin source update src_abc123 --name "New Name"      # by ID (preferred)
releases admin source update next-js --url https://github.com/vercel/next.js/releases
releases admin source update my-blog --org acme                 # set organization
releases admin source update my-blog --no-org                   # remove organization
releases admin source update my-blog --type feed                # change adapter type
releases admin source update my-blog --no-feed-url              # clear stored feed URL
releases admin source update my-blog --markdown-url https://example.com/changelog.md
releases admin source update my-blog --primary                  # mark as org's primary changelog
releases admin source update my-blog --slug new-slug --confirm-slug-change
```

Slug renames require `--confirm-slug-change` because they break existing web links.

### Fetch

```bash
releases admin source fetch next-js              # one source
releases admin source fetch --since 2025-01-01 --max 50
releases admin source fetch --max 500            # override the 200/source default
releases admin source fetch --all                # no date/count limits
releases admin source fetch --stale 24           # only stale sources, with backoff
releases admin source fetch --retry-errors       # retry sources whose last fetch failed
releases admin source fetch --changed            # sources with upstream changes detected
releases admin source fetch --unfetched --concurrency 5
releases admin source fetch next-js --skip-changelog   # skip CHANGELOG.md refresh
```

Notes:

- Default cap is 200 releases per source (GitHub paginates at ~10K). `--max <n>` or `--all` to override.
- Remote mode **requires** a filter or slug. Bare `releases admin source fetch` with no args is blocked to prevent accidental bulk work.
- Remote concurrency defaults to 3, capped at 5. Duplicate source fetches are detected and blocked.
- Smart fetch backoff: sources returning no changes back off exponentially (1h → 48h); error backoff caps at 72h.

### Poll (cheap change detection)

```bash
releases admin source poll                  # HEAD-check all feed sources
releases admin source poll next-js          # one source
releases admin source poll --changed        # only show sources flagged with changes
releases admin source poll --json
```

Pure HEAD-based, no AI or parsing. The hosted cron runs this hourly; `--changed` is mostly useful for ad-hoc checks.

### Fetch history

```bash
releases admin source fetch-log                   # across all sources
releases admin source fetch-log next-js           # one source
```

### Health checks

```bash
releases admin source check             # all sources
releases admin source check next-js     # one source
```

## Organizations

```bash
releases admin org create "Vercel" --category developer-tools --tags typescript,edge
releases admin org create "Vercel" --tags typescript,edge --dry-run    # preview, no write
releases admin org list                                   # summary view
releases admin org get vercel                             # full details (accounts, tags, sources, products, aliases)
releases admin org update vercel --category developer-tools
releases admin org link vercel --platform github --handle vercel
releases admin org tag add vercel react serverless
releases admin org alias add anthropic claude.ai claude.com
releases admin org refresh vercel                         # fetch all sources + regenerate overview
```

`org refresh` flags: `--max <n>` (per-source cap, default 20), `--concurrency <n>`, `--window <days>`, `--dry-run`, `--skip-overview`, `--json`.

## Products

Products group sources under multi-product orgs (e.g. Vercel → Next.js, Turborepo, v0):

```bash
releases admin product create "Next.js" --org vercel --url https://nextjs.org
releases admin product list vercel
releases admin product update nextjs --description "React framework for production"
releases admin product tag add nextjs react
releases admin product alias add nextjs nextjs.org
releases admin product delete nextjs          # sources become unlinked, not deleted
releases admin product adopt nextjs --into vercel   # convert an org into a product
```

## Releases

```bash
releases admin release get rel_abc123
releases admin release update rel_abc123 --title "Fixed title" --version "v2.0.1"
releases admin release delete rel_abc123
releases admin release suppress rel_abc123 --reason "promotional content"
releases admin release unsuppress rel_abc123
```

Suppressed releases are hidden from all read paths (search, latest, stats, API) but preserved for audit.

## Policies

Ignored URLs are **org-scoped**; blocked URLs are **global**.

```bash
releases admin policy ignore add https://example.com/blog --org vercel --reason "Not a changelog"
releases admin policy ignore list --org vercel
releases admin policy block add medium.com --domain --reason "Aggregator"
releases admin policy block list
```

## Discovery

AI-powered onboarding for whole companies:

```bash
releases admin discovery onboard "Vercel"
releases admin discovery onboard "Stripe" --domain stripe.com --github-org stripe
releases admin discovery evaluate https://linear.app/changelog --json
releases admin discovery task list                # in-flight discovery sessions
releases admin discovery task cancel <sessionId>
```

## Import

Bulk-import orgs and sources from a JSON manifest:

```bash
releases admin source import manifest.json
releases admin source import manifest.json --dry-run
releases admin source import manifest.json --skip-existing
```

## MCP bridge

Run a local stdio MCP bridge that proxies the hosted tools:

```bash
releases admin mcp serve
```

Useful for clients that only support stdio transport. For native remote MCP support (Claude Code, Codex), connect directly to `https://mcp.releases.sh/mcp` instead.
