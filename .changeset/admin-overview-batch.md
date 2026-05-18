---
"@buildinternet/releases": minor
---

`releases admin overview batch` wraps the new `BatchOverviewWorkflow` (`POST /v1/workflows/batch-overview`). Flags map 1:1 to the workflow body: `--orgs <slug,slug>`, `--min-new-releases`, `--min-overview-age-days`, `--max-candidates`, `--max-cost-usd`. Pass `--wait` to poll the status endpoint every 30s until the workflow reaches a terminal state; without it the command prints `instanceId` + `statusUrl` and returns immediately.

Sits next to the agent-driven `admin overview inputs` / `admin overview update` so the batch path is discoverable alongside the single-org regen flow. Closes #1005.
