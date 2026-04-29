---
"@buildinternet/releases": patch
---

Disable oxlint's `no-underscore-dangle` rule, surfaced by the 1.62 upgrade. The codebase deliberately uses leading-underscore identifiers for module-private state (`_dataDir`, `_apiUrl`, `_apiKey`, `_admin`); the rule's complaints aren't actionable. Keeps lint output clean and matches the same change in the monorepo for cross-repo consistency. CI-only; no runtime change.
