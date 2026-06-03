---
"@buildinternet/releases": patch
---

`admin source fetch-log <source>` now shows an in-progress banner when a managed-agent fetch is still running for that source — the session id plus how long it has been running — so an operator can tell a live fetch from a stuck one instead of seeing only terminal history (#1360). The source-filtered query reads the API's enveloped `activeSession`; `--json` output is unchanged (still the bare logs array). The status column also labels the `crawl_timeout` (#1361) and `blocked` (#1171) states distinctly instead of rendering them as "no change".
