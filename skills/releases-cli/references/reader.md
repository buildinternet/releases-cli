# Reader Commands

Reader commands are unauthenticated — no API key required. They talk to `api.releases.sh` over HTTPS and all support `--json` for machine-readable output.

## Search

Hybrid lexical + semantic search across releases and CHANGELOG chunks.

```bash
releases search "authentication"
releases search "vercel" --type releases --limit 5
releases search "breaking change" --json
releases search "retry" --org stripe
```

Flags:

- `--type <releases|sources|all>` — narrow result kind (default: `all`).
- `--org <slug>` — scope to one organization.
- `--product <slug>` — scope to one product.
- `--limit <n>` — default 20.
- `--mode <lexical|semantic|hybrid>` — default `hybrid`. Use `lexical` for pure FTS ranking.
- `--json` — machine output; each hit includes a `kind: "release" | "changelog_chunk"` discriminator.

Chunk hits carry `sourceSlug`, `chunkOffset`, and `chunkLength` so you can chain into `releases admin source changelog <slug> --offset N` (or the MCP `get_source_changelog` tool) to read surrounding context.

## Latest releases

```bash
releases latest                          # across all sources
releases latest next-js                  # one source (by slug)
releases latest --org vercel --count 20  # whole org
releases latest --product nextjs         # one product
releases latest --type feature           # filter by release type
releases latest --json
```

## List sources

```bash
releases list                          # all sources
releases list next-js                  # detail for one source (by slug or id)
releases list --org sentry             # filter by organization
releases list --product nextjs         # filter by product
releases list --query shadcn           # name / slug / url substring
releases list --has-feed               # sources with a discovered feed URL
releases list --category ai            # filter by category
releases list --json                   # machine-readable output
releases list --json --compact         # lightweight JSON (id, slug, name, type, org, date)
releases list --json --limit 20 --page 2  # pagination (server-side)
```

Aliased as `releases admin source list` for discoverability within admin workflows.

## Show any entity

Top-level `show` dispatches by ID prefix, and falls back to slug lookup:

```bash
releases show rel_XqbzLaOqBFz7VSAIqx2zs   # release (rel_)
releases show src_abc123                   # source (src_)
releases show org_abc123                   # organization (org_)
releases show prod_abc123                  # product (prod_)
releases show vercel                       # slug fallthrough (org → product → source)
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

## Changelog slicing (admin CLI, reader endpoint)

The stored CHANGELOG.md for a GitHub source can be sliced from the reader API. The CLI wrapper lives under admin for discoverability but the endpoint itself is public:

```bash
releases admin source changelog apollo-client                      # full file
releases admin source changelog apollo-client --limit 10000        # first 10k chars, heading-aligned
releases admin source changelog apollo-client --tokens 5000        # first ~5k cl100k_base tokens
releases admin source changelog apollo-client --offset 10000 --json
```

`tokens` and `limit` are both heading-aware; `tokens` wins when both are passed. Chain successive calls via the returned `nextOffset` to reconstruct the file exactly. Recommended token brackets: 2000 / 5000 / 10000 / 20000.
