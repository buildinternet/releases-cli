---
"@buildinternet/releases": minor
---

`releases admin source fetch` now accepts `--wait [seconds]`, blocking until the managed-agent session reaches a terminal state. Without `--wait` the command stays fire-and-forget. Default wait is 900s; pass an explicit value to shorten it (e.g. `--wait 60`).

Exit codes:

- `0` — session completed successfully
- `1` — our-side error (no tools called, parser failure, timeout)
- `2` — managed-agents/provider error (e.g. `unknown_error`, `model_overloaded_error`, retries exhausted) — the message is tagged `(managed-agents · <type>)` and includes retry count when the session ended in `retries_exhausted`
- `130` — session cancelled

Closes the silent-failure gap surfaced in [registry #590](https://github.com/buildinternet/releases/issues/590) where backend incidents bubbled up as `exit 0` even though no work happened.
