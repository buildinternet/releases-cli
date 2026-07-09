---
"@buildinternet/releases": minor
---

`releases org get` now renders stub-tier orgs (#1947): a `stub · not yet tracked` marker on the header and a `Declared locations` section listing each declared locator (kind, target, `canonical` flag), plus a hint to promote. Previously a stub printed as a bare identity block with no indication it was a declared-but-untracked listing. `--json` output is unchanged.
