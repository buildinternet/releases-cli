---
"@buildinternet/releases": minor
---

Auto-create products at onboarding: `onboard apply` now reads optional `productName`/`productSlug` tags emitted by the discovery agent and performs a lookup-or-create for each distinct product before attaching sources to the right product under the org.
