---
"@buildinternet/releases": patch
---

Drop the local `EvaluationResult` and `OrgDependentsResponse` declarations from `src/api/types.ts` and pull both from `@buildinternet/releases-api-types` 0.7.0 instead. The carve-outs were only there because the canonical types lived in private monorepo packages; both have been upstreamed (`OrgDependentsResponse` since api-types 0.5.0, `EvaluationResult` in 0.7.0 — buildinternet/releases#569). No surface change for CLI consumers — the same shapes are now imported via `export * from "@buildinternet/releases-api-types"`.
