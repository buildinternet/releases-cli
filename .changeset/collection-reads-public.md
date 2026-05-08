---
"@buildinternet/releases": minor
---

Collections are now first-class browsable from the CLI.

- `releases collection list` and `releases collection get <slug>` are public — no API key needed. The same commands also stay under `admin` for back-compat.
- New `releases collection releases <slug>` shows the cross-org release feed with cursor pagination (`--limit`, `--cursor`, `--include-prereleases`).
- `releases get <orgslug>` now lists the collections an org belongs to. Failures degrade silently with a logger warning so an unrelated bug in the collections endpoint never breaks the canonical org card.

The wire shape for `CollectionReleaseItem` isn't published in `@buildinternet/releases-api-types` yet, so the CLI declares it inline. When api-types ships its next minor, the inline type can drop.
