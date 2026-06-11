---
"@buildinternet/releases": patch
---

`releases admin source fetch` no longer silently drops a source identifier when combined with `--org` (#307). Previously `source fetch <identifier> --org <org>` ignored the identifier and dispatched a managed-agent session over every active source in the org; it now errors out on the conflict, matching `releases latest`'s `--product`/`--org` rejection. Passing both the positional identifier and `--source` is also rejected instead of silently preferring the positional. The `--org` fan-out additionally skips push-only `agent` sources — they have no fetch adapter, so dispatching a session over one was a wasted no-op — and reports how many were skipped.
