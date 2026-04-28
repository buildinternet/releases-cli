---
"@buildinternet/releases": minor
---

`releases admin overview-list` lists organizations with their overview status. Pass `--stale` to filter to orgs whose overviews need regeneration:

```
releases admin overview-list --stale
releases admin overview-list --stale --stale-min-releases 3 --stale-grace-days 14
releases admin overview-list --stale --json
```

An org is considered stale when `recentReleaseCount > minReleases` AND the overview is either missing or `lastActivity > overview.updatedAt + graceDays`. Defaults: `minReleases=5`, `graceDays=7`.

The `--json` output carries `slug`, `name`, `recentReleaseCount`, `lastActivity`, `overviewUpdatedAt`, and `overviewMissing` — suitable for piping into the weekly regen routine (registry trigger `trig_012B14fpLS1inAkEuJTZBbnd`) which currently encodes this filter in its prompt.

Closes [registry #590](https://github.com/buildinternet/releases/issues/590) item 6.
