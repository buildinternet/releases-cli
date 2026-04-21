---
"@buildinternet/releases": minor
---

feat(admin): add `overview`, `overview-inputs`, `overview-write` commands

Restores the operator-side surface for AI overview regeneration after
`@buildinternet/releases` deleted the local generator in #385. Pairs with the
new server route `GET /v1/overview-inputs` and the existing dumb upsert at
`POST /v1/overview`. Generation itself runs in Claude Code via the
`regenerating-overviews` skill — no Anthropic client returns to the CLI.

- `releases admin overview <slug>` — read the current overview
- `releases admin overview-inputs <slug> --json [--window N]` — input-builder
- `releases admin overview-write <slug> --content-file <path>` — upload result
