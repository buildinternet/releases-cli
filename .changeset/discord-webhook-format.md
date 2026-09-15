---
"@buildinternet/releases": minor
---

Add `--format discord` to `releases webhook add`/`edit` to deliver releases as formatted Discord embeds via a Discord incoming webhook URL. Human-readable webhook output redacts the delivery URL (the secret for Slack/Discord); `--json` still includes it.
