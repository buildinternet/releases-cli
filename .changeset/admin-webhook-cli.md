---
"releases-cli": minor
---

Add `releases admin webhook` commands for managing outbound webhook subscriptions: `add`, `list`, `show`, `edit`, `remove`, `test`, `rotate-secret`, and `deliveries`. These wrap the existing root-key-gated `/v1/webhooks` API routes so Phase-A operators can manage subscriptions without raw API calls.

The subscriber-facing `webhook verify` (local signature check, no auth) moves from `admin webhook verify` to top-level `webhook verify`.
