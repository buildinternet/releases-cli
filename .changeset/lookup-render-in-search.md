---
"@buildinternet/releases": minor
---

Add on-demand lookup rendering to `releases search`. When the API returns a `lookup` payload (coordinate-shaped queries like `org/repo` that miss every curated entity), a new **Lookup** section prints before the regular results — covering all five outcomes (`indexed`, `existing`, `empty`, `not_found`, `deferred`) plus an inline release preview (up to 5) and a "Did you mean" rail when the org segment matches a curated org. The payload is also included in `--json` output. Bumps the `@buildinternet/releases-api-types` pin to `^0.3.0`.
