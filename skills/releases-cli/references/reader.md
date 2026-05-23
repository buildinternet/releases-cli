# Reader Commands

Reader commands are unauthenticated — no API key required. They talk to `api.releases.sh` over HTTPS and all support `--json` for machine-readable output.

**Release JSON is slim by default.** `get`, `search`, and `tail`/`latest` return a lean release shape — `id`, `version`, `title`, `summary`, a markdown-stripped `excerpt`, `url`, `publishedAt`, nested `source`/`org`, and `contentChars`/`contentTokens` size hints. This drops storage internals (`contentHash`, `sourceId`, `versionSort`, `fetchedAt`, …) and the redundant `title*` variants to keep token usage low. Add `--full` when you need the complete payload (including the full `content` body). `summary` may be `null`; lean on `excerpt` / `contentChars` to decide whether to pull more.

> **Piping note:** in the default (non-`--json`) TSV output, release rows repeat the title across several columns (raw title, normalized title, version). Don't assume `cut -f2` lands on a unique field — check the row layout first, or just use `--json` for stable parsing.

## Search

Unified search across organizations, the catalog (products + standalone sources), and releases.

```bash
releases search "authentication"
releases search "vercel" --type releases --limit 5
releases search "react" --type catalog
releases search "stripe" --kind sdk         # taxonomy filter
releases search "breaking change" --json
```

Flags:

- `--type <orgs|catalog|releases>` — narrow to one section (default: all three). `products` is accepted as a deprecated alias for `catalog`.
- `--limit <n>` — max results per section (default: 10).
- `--mode <lexical|semantic|hybrid>` — pick the release-retrieval strategy. Server default is hybrid; pass `lexical` for pure FTS ranking.
- `--kind <platform|sdk|mobile|desktop|docs|integration|tool>` — taxonomy filter. Release hits match `COALESCE(source.kind, product.kind)` (a source with no kind inherits from its product); catalog hits match the row's own kind directly.
- `--json` — machine output (slim release hits by default; `--full` for the complete shape). Release hits include a `kind: "release" | "changelog_chunk"` discriminator. Catalog hits include `entryType: "product" | "source"` (the entity discriminator) plus an optional `kind` field carrying the taxonomy classification.
- `--full` — with `--json`, return complete unprojected release hits (full `content`, `score`, `sourceType`, `title*` variants, …).

Catalog hits also include the response field `catalog`. Older API deploys will still send the deprecated `products` alias instead — the CLI reads either, but new code should consume `catalog`.

### On-demand GitHub lookup

When the query is a `{org}/{repo}` coordinate (optionally prefixed `github:`) and no entity (org or catalog source) matched, the registry probes GitHub on demand and the CLI prints a **Lookup** section above the regular results. Coordinate matching is case-insensitive — `Shopify/toxiproxy` and `shopify/toxiproxy` resolve to the same source row. The lookup fires even when tangential release hits surface on a single segment token, so a coordinate is treated as a precise question about one repo.

```bash
releases search "vercel/next.js"             # bare coordinate
releases search "github:Shopify/toxiproxy"   # explicit provider prefix
```

Statuses on the Lookup section: `INDEXED` (just materialized), `EXISTING` (already tracked), `EMPTY` (real repo, no releases or CHANGELOG yet), `NOT_FOUND` (private/archived/missing), `DEFERRED` (rate-limited or 5xx — retry shortly).

## Latest releases

```bash
releases tail                          # across all sources
releases tail next-js                  # one source (slug)
releases tail src_abc123               # one source (typed id)
releases tail --org vercel --count 20  # whole org (org_…, slug, domain, name, or handle)
releases tail --product nextjs         # one product (prod_… or slug)
releases tail --type feature           # filter by release type
releases tail --json                   # slim shape
releases tail --json --full            # complete payload
```

## List sources

```bash
releases list                          # all sources
releases list next-js                  # detail for one source (src_… or slug)
releases list --org sentry             # filter by organization (org_…, slug, domain, name, or handle)
releases list --product nextjs         # filter by product (prod_… or slug)
releases list --query shadcn           # name / slug / url substring
releases list --has-feed               # sources with a discovered feed URL
releases list --category ai            # filter by category
releases list --kind sdk               # filter by taxonomy (platform|sdk|mobile|desktop|docs|integration|tool)
releases list --json                   # machine-readable output
releases list --json --compact         # lightweight JSON (id, slug, name, type, org, date)
releases list --json --limit 20 --page 2  # pagination (server-side)
```

Aliased as `releases admin source list` for discoverability within admin workflows.

## Get any entity

Top-level `get` dispatches by ID prefix, and falls back to slug lookup:

```bash
releases get rel_XqbzLaOqBFz7VSAIqx2zs   # release (rel_)
releases get src_abc123                   # source (src_)
releases get org_abc123                   # organization (org_)
releases get prod_abc123                  # product (prod_)
releases get vercel                       # slug fallthrough (org → product → source)
```

Use this when you have an ID from another tool output (search results, MCP tool responses, etc.) and want to inspect it without caring what kind of entity it is.

## Stats

```bash
releases stats              # index overview, source health, recent fetch activity
releases stats --days 7     # adjust the activity window
releases stats --json
```

## Categories

```bash
releases categories          # list the canonical category values
releases categories --json
```

The category list is fixed — adding a new category requires a code change in `@buildinternet/releases-core`.

## Reading a tracked changelog

`releases get <source> --json` reports `hasChangelogFile` and `changelogUrl` keyless, so you can detect whether a source maintains a checked-in CHANGELOG.md. This only exists for **sources that track one** — tag-only repos (e.g. Next.js, which ships GitHub releases but no CHANGELOG file) and products report `hasChangelogFile: false`.

To read the **sliced content** without a key, use one of:

- The MCP tool `get_catalog_entry` with `changelog_tokens` (heading-aligned; recommended brackets 2000 / 5000 / 10000 / 20000) and chain via the returned `nextOffset`. Every response reports `totalTokens` so you can budget calls upfront.
- Fetch the `changelogUrl` directly (it points at the raw file on GitHub).

> The CLI also has a `releases admin source changelog <slug>` wrapper, but it lives under `admin` and is **key-gated** — it fails with `"admin" requires an API key` for keyless users. Prefer the two keyless paths above unless you already hold an admin key.

## Collections

Curated cross-org "playlists" (e.g. Frontier AI Labs, Coding Agents), keyless:

```bash
releases collection list                       # all collections
releases collection get frontier-ai-labs       # members of one collection
releases collection releases frontier-ai-labs  # interleaved cross-org release feed (--limit <n>, --json)
```

## Domain lookup

Resolve a domain or URL to the org/product that owns it (keyless):

```bash
releases lookup domain vercel.com
releases lookup domain https://tailwindcss.com/blog
```

## Agent self-discovery

```bash
releases agent-context        # versioned JSON: every command, argument, and option
```

When unsure of exact flags or subcommands, call `agent-context` rather than guessing — it's the CLI's own machine-readable contract, versioned via `schemaVersion`.
