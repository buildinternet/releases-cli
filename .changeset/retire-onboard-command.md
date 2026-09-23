---
"@buildinternet/releases": minor
---

`releases admin discovery onboard` no longer starts a remote discovery session. The discovery worker and `POST /v1/workflows/discover` were retired (buildinternet/releases#2352); the command now exits 1 with a pointer to `releases admin org create`, `releases admin source create`, and the `local-ingest` skill. `onboard apply` and the `--managed-agents` / `--sandbox` engine flags are removed.
