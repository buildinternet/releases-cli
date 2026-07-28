---
"@buildinternet/releases": patch
---

Fix `getApiUrl()` memoizing the API base URL process-wide on first call. Under `bun test`, every test file shares one process, so whichever file called it first locked the base URL for the rest of the run — files that set `RELEASES_API_URL` afterward got the stale (production) URL instead and their assertions failed. This was silently CI-red on `main` (22 tests failing) because CI's clean environment produces a call order that trips the memoization, while a developer machine with real credentials hits a different, unrelated set of failures. `getApiUrl()` now re-resolves from the environment on every call instead of caching.
