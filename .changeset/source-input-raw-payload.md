---
"@buildinternet/releases": minor
---

Agent-DX: raw JSON payloads for source mutations via `--input`.

`releases admin source create` and `releases admin source update` now accept a `--input <json>` body, so an agent can send the request shape directly instead of reverse-mapping it onto a dozen bespoke flags. Pass a literal JSON string, `@<path>` for a file, or `-` for stdin.

- The body maps to the **CLI input shape**, not the raw API — dedup, org-resolution, metadata-packing, and validation still run. `create --input` mirrors a `--batch` element (`name`/`url`/`type`/`org`/`metadataSet`/…); `update --input` maps to the update fields plus a convenience `metadata` object (each key set directly, a JSON `null` value deletes it).
- `--strict`/`--dry-run`/`--json` remain execution modifiers from the flags (the body never sets them). On `create`, `--input` is mutually exclusive with `--batch`.
- Invalid JSON and shape errors throw `CliError`, so they serialize to the structured `{ error }` payload under `--json`.
