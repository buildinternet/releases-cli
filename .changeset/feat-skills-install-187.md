---
"@buildinternet/releases": minor
---

feat(cli): add `releases skills install` for cross-agent skill installation (#187). Thin wrapper around `npx skills add buildinternet/releases-cli` from the open agent-skills ecosystem (`vercel-labs/skills`), which auto-detects ~50 supported coding agents (Claude Code, Cursor, Codex, Gemini CLI, Windsurf, GitHub Copilot, …) and writes the 8 bundled skill files to the right per-agent directory. Forwards `--global`, `--agent <name>`, `--copy`, `--list`, and `--no-yes` to the underlying `skills add` invocation. Skills are symlinked by default, so re-running the command refreshes everything atomically.
