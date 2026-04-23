---
"@buildinternet/releases": patch
---

Discovery triggers moved under `/v1/workflows/*` on the API per issue #504 tier 2. The `releases admin discovery onboard` and `releases admin fetch` commands are unchanged from the user's perspective, but the underlying URLs now follow the convention:

- `POST /v1/discover` → `POST /v1/workflows/discover`
- `POST /v1/update` → `POST /v1/workflows/update`
- `GET /v1/discover/:sessionId` is gone — the CLI polls `GET /v1/sessions/:sessionId` instead, which reads from the same DO with a richer shape (progress fields live at the top level, not nested under `progress`).
