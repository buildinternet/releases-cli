---
"@buildinternet/releases": minor
---

Add a `--local` handoff flag to `admin source fetch <slug>` (#273). It stages local onboarding for the `local-ingest` skill instead of dispatching the remote managed agent: it runs the same robots.txt / Content-Signal opt-out preflight as the monorepo skill (refuses on `ai-input=no` / `ai-train=no`, e.g. `conductor.build`; `--force` overrides with explicit publisher permission), resolves the source, discovers candidate page URLs from `/sitemap.xml` (filtered to the changelog path) or the index HTML, classifies the page shape, and prints a structured handoff brief (`--json` supported) — the org-scoped batch endpoint, the preflight verdict + parsed Content-Signal, and a capped candidate-URL list with an explicit skip note (no silent truncation). No managed-agent session, no model call, and no Anthropic/adapter dependency added to the thin client — HTTP fetch + string parsing only. Exit codes: 0 proceed, 1 refuse, 2 unknown.
