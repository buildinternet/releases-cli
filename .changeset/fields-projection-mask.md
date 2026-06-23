---
"@buildinternet/releases": minor
---

Agent-DX: `--fields` projection mask on the reader commands.

`--fields id,version,source.slug` post-filters `--json` output down to a comma-separated mask (dot-notation for nested keys), so an agent can pull exactly the leaves it needs and spend fewer tokens.

- Available on `get` (release/source/org/product), `search`, and `tail`/`latest`.
- It's a post-projection over whatever shape the reader produced, so it **composes with `--full`** (mask the full payload) and reuses the slim vocabulary by default — no new field names to learn.
- Dot-notation walks plain objects only (request an array-valued field like `media` whole). A field that resolves nowhere is dropped with one stderr warning; `--fields` without `--json` warns and is ignored, matching `--full`.
- Generic backend in `src/lib/fields.ts` (`projectFields`/`applyFieldMask`), reusable for future readers.
