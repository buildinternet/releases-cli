---
"@buildinternet/releases": minor
---

`admin org delete --hard` now shows a cascade-scope preview and requires the user to type the org slug back to confirm. Backs the post-#690 Phase C schema, where hard-deleting an org now cascades into every source, release, fetch_log, changelog file/chunk, release summary, media asset, and webhook subscription tied to it (vs. orphaning sources via SET NULL pre-flip).

- `releases admin org delete <slug> --hard` lists exact dependent counts, then waits for slug typeback. Wrong slug aborts with exit 1 and no API call to the destructive endpoint.
- `--yes` / `-y` skips the prompt for scripted ops.
- A piped (non-TTY) stdin without `--yes` exits 1 with a clear "no interactive TTY" message instead of silently auto-confirming.
- Soft-delete (default, no `--hard`) is unchanged — still tombstones via `deleted_at`, no prompt.
- `admin org remove` continues to work as an alias of `admin org delete`.

Counts are pulled from the new `GET /v1/admin/orgs/:slug/dependents` endpoint, so the preview matches whatever the API would actually cascade-delete. Requires `@buildinternet/releases-api-types` ≥ 0.5.0 on the server side.
