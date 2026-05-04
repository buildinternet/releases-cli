---
"@buildinternet/releases": minor
---

Adopt the `-` stdin convention in two more commands and tighten `--json` output safety on alias listings.

- `releases import <file>` now accepts `-` for stdin (`cat manifest.json | releases import -`). Removes the temp-file dance for callers that generate manifests from another command.
- `releases admin webhook verify --body-file <path>` now accepts `-` for stdin (`curl ... | releases admin webhook verify --secret ... --signature ... --body-file -`). Mirrors the convention already in `add --batch -` and `admin overview-write --content-file -`.
- `org alias list --json` and `product alias list --json` now route through the drain-safe `writeJson()` helper instead of `console.log(JSON.stringify(...))`. Closes the small remaining surface area of the 96 KB pipe-truncation class first fixed in #33.

Shared internal helper `readContentArg(pathOrDash)` lives in `src/lib/input.ts` for use by future file-or-stdin commands. No breaking changes — existing `--content-file <path>` / positional `<file>` invocations continue to work unchanged.
