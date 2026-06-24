---
"@buildinternet/releases": patch
---

Fix: streaming output (`--page-all`, `tail -f --json`) now exits cleanly when a reader closes the pipe early (`… | head`).

Piping NDJSON streaming output into a consumer that closes stdout before EOF — e.g. `releases list --json --page-all | head` or `… | jq | head` — caused the CLI to hang indefinitely. On the early close the next stdout write raises EPIPE, which Bun surfaces as an `'error'` event (rather than crashing); with no handler, the writer was left awaiting a `'drain'` that can never fire. A startup `process.stdout.on("error", …)` handler now treats a broken pipe as a clean `exit(0)`, so `| head` terminates immediately. Full consumption (to EOF, to a file, `| wc -l`) is unaffected.
