---
"@buildinternet/releases": minor
---

Improve top-level help discoverability and surface the web catalog.

- `releases --help` (and `releases help`) now list **every** command — `lookup`, `collection`, `auth`, `whoami`, `completion`, `skills`, and more — instead of the curated seven. Bare `releases` still shows the friendly quick-start.
- The landing screen now shows the web catalog (`https://releases.sh`) in its header, and the full `--help` listing carries it too.
- Removed the `Exit codes: see README.md#exit-codes` footer line from the landing screen.
- The curated landing now labels the command `tail` (matching the "most common commands" block) instead of its `latest` alias.
- The first-run completion hint no longer nags when completions are already installed by the package manager (e.g. Homebrew generates them at install time). Documented that Homebrew installs completions automatically while npm / shell-installer / binary users run `releases completion install` once.
- The landing screen and `--help` now show a persistent, self-resolving notice when shell completion isn't set up (e.g. for npm / binary installs) — `Shell completion isn't set up — run "releases completion install <shell>"`. It disappears automatically once completions are detected (user- or package-manager-installed), is TTY-gated so it never pollutes piped output, and respects `RELEASES_NO_COMPLETION_HINT`.
