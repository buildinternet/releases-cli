---
"@buildinternet/releases": minor
---

Add `releases source fetch <source> --dry-run`: probe a single source without writing to D1 or dispatching (billing) the managed agent. For a client-rendered scrape source (`crawlEnabled`/`renderRequired`) it renders the index once via Browser Rendering and reports how many candidate release links were found — the cheap "can the steady-state cron render actually see releases here, or is it hitting an empty JS shell?" check that onboarding previously had no way to answer. For a feed/GitHub source it reports candidate releases parsed. Single source only; `--json` supported.
