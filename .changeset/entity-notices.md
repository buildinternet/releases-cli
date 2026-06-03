---
"@buildinternet/releases": minor
---

Add entity-notice rendering (Part A) and set/clear verbs (Part B) for org, product, and source entities (#278).

**Part A — render:** `releases get`, `releases org get`, and `releases admin source update` detail views now display a curator notice in yellow when the API returns one — formatted as `Notice: <message> → <coordinate-or-href>` (pointer omitted when absent). The notice also passes through in all `--json` outputs.

**Part B — set/clear:** New flags on the three entity update commands:

- `releases org update --notice <msg>` / `--notice-link <coord|url>` / `--notice-link-text <label>` / `--clear-notice`
- `releases admin product update` — same flags
- `releases admin source update` — same flags

`--notice-link` is routed automatically: an `https?://` value is sent as `href`; anything else is validated as a 1–2-segment registry coordinate (`org` or `org/slug`) and sent as `coordinate`. `--clear-notice` sends `{ notice: null }` to remove an existing notice. The flags are mutually exclusive (`--clear-notice` + `--notice` exits with an error).

All flag parsing lives in `src/lib/notice.ts`. The `Notice` type is imported from `@buildinternet/releases-core@0.23.0` (canonical source); this PR also bumps `@buildinternet/releases-api-types` to `^0.29.0`.
