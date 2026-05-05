---
"@buildinternet/releases": patch
---

Soften the not-found UX for read-only lookups (`releases get`, `releases release get`) and parallelize `releases get` fallback resolution.

A miss on `releases get <thing>` is a normal answer for a lookup, not a software fault. The output now reads `[releases] No <kind> matching: <input>` (info-level, no red `ERROR:` framing). In `--json` mode the command also writes `null` to stdout before the stderr line, so JSON consumers get parseable output instead of nothing. Exit code stays `1` — the contract for "scripts can detect a miss" doesn't change.

When the identifier doesn't carry a typed-ID prefix, `releases get` previously made up to three sequential API round-trips (`findOrg` → `findProduct` → `findSource`) before giving up. Those now run in parallel via `Promise.all`, so a miss takes ~one round-trip instead of three. Hits behave the same — the first matching kind wins.

Mutating commands (`release delete/update/suppress/unsuppress`, `delete`, `update`, `ignore add/remove`, `product alias`, etc.) keep the louder error treatment; for those, "thing doesn't exist" really is an error.
