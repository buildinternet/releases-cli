---
"@buildinternet/releases": minor
---

Improve the default `releases get` output for all entity kinds so the response is useful on its own without flag discovery, while staying token-efficient via progressive disclosure to the dedicated drill-in commands.

- **Release**: the summary is now labeled `Summary · AI-generated, abbreviated` (it was unlabeled before, so callers couldn't tell it wasn't the full body). Every response ends with a `Next steps` footer that points at `releases release get <id>` for the full content — phrasing flips when no summary is on file yet.
- **Organization**: now surfaces description, tags, a source breakdown (active / erroring / hidden), and the product list with names + slugs. Latest-releases preview trimmed from 10 to 5. Footer hints at `org get` (overview / accounts / aliases), `org overview`, and the org-scoped release feed.
- **Product**: previously showed only static metadata. Now adds description, tags, and the product's source list, with footer hints to the org-scoped release feed and to drilling into a specific source.
- **Source**: previously showed only static metadata. Now adds org/product binding, fetch status (active / erroring / hidden), `lastFetchedAt`, and the latest 5 releases for the source. Footer hints at `list --source`, `fetch-log`, and `release get`.

Also fixes a latent bug in `getProductsByOrg`: `/v1/products` returns a paginated envelope but the client typed the response as a bare array, so every downstream `for/find/filter/map` was silently no-op'ing. That's why the previous `releases org get` Products section never rendered for orgs that had products (e.g. Supabase's Auth / CLI / Client SDK). The client now unwraps the envelope and tolerates the legacy bare-array shape.

JSON output gains a few additive fields (`sources`, `products`, `sourceCount`, `tags`) on the org/product responses; existing fields are unchanged.
