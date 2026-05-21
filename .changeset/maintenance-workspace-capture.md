---
"@buildinternet/releases": minor
---

Auto-capture for the `~/.releases/work/` maintenance workspace (two independent mechanisms):

- **Admin-mutation log.** When `RELEASES_RUN_DIR` is set, every `releases admin …` write appends one JSONL line (`{timestamp, command, target, result}`) to `$RELEASES_RUN_DIR/mutations.jsonl`. Logged at the api-client chokepoint; telemetry/heartbeat endpoints are excluded. Unset → no-op, and fully fail-open (a logging failure never breaks the write).
- **Managed-session traces.** `--trace-dir <dir>` on `onboard`, `source fetch --wait`, and `overview batch --wait` writes the terminal session/workflow as `<dir>/<id>/{trace.json,summary.md}`; `admin discovery task get <id> --save [dir]` snapshots an existing session retroactively. Trace dir precedence: explicit flag > `RELEASES_RUN_DIR` > `~/.releases/work/runs`. `summary.md` mirrors the run-summary template in the monorepo's `docs/architecture/maintenance-workspace.md`.
