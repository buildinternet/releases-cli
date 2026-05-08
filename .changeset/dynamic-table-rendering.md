---
"@buildinternet/releases": minor
---

Tabular reader commands (`get`, `org list`, `product list`, `list sources`, `collection list`, `stats`, `check`, `fetch-log`, `admin overview list`, `admin overview plan`) now fit themselves to the terminal width instead of relying on bordered tables that broke when the window was narrow.

- TTY: borderless, two-space delimited columns; uppercase cyan headers; per-column truncation with `…`; per-column right-alignment for counts. Width is read from `process.stdout.columns` (override with `COLUMNS=<n>`).
- Non-TTY (piped): bare TSV — no headers, no color, no truncation — so `releases org list | cut -f2` works without parsing ANSI. For complete parseable output, prefer `--json`.

Replaces `cli-table3` with a small in-tree renderer in `src/cli/render/table.ts` that uses `string-width` for accurate width measurement on ANSI-colored and wide-character cells. Per-column `noTruncate: true` locks a column to its natural width (e.g. release IDs, dates).
