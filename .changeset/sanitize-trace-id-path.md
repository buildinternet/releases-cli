---
"@buildinternet/releases": patch
---

Constrain API-derived trace IDs (`session.sessionId`, workflow `instanceId`) to a single safe path segment before writing trace files, so a malicious or tampered API response can't traverse out of the trace directory (`../`, separators, absolute paths). Fails closed: an unusable id throws rather than writing to an unexpected location.
