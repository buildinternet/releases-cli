---
"@buildinternet/releases": minor
---

Extend `--dry-run` coverage to the remaining mutating `admin` commands.

Previously only delete-shaped commands and a few specials (`source import`, `product adopt`, `release suppress`, `policy ignore/block`, `embed`) could preview their effects. Create/update/link verbs went straight to the API, which made scripted onboarding flows hard to validate before running them.

Now also supports `--dry-run`:

- `admin org create` (+ deprecated `org add`)
- `admin org update` (+ deprecated `org edit`)
- `admin org link`, `admin org unlink`
- `admin product create` (+ deprecated `product add`)
- `admin product update` (+ deprecated `product edit`)
- `admin source create` (+ deprecated `source add`)
- `admin source update` (+ deprecated `source edit`)
- `admin release update` (+ deprecated `release edit`)
- `admin release unsuppress`

For `source create`, the dry-run still resolves the org (creating it would normally happen here, so the preview reports "would create" instead) and runs the existing-URL and exclusion checks before reporting the planned write — operators get the same rejection signal they would on a real run, without writes. Same idea for `source update`'s auto-create-org branch.

Tag and alias add/remove on org/product still don't take `--dry-run`; those are trivially reversible joins where the preview adds little.
