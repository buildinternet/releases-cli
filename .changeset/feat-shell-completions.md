---
"@buildinternet/releases": minor
---

feat(cli): add shell completion support for bash, zsh, and fish. `releases completion <bash|zsh|fish>` prints the script to stdout; `releases completion install` detects the user's shell and writes the script to the conventional location, mirroring how `gh` ships completions. Homebrew installs all three shells automatically via the formula update in buildinternet/buildinternet-homebrew-tap. On interactive TTYs, a one-time stderr hint nudges users who haven't installed completions yet — silence with `RELEASES_NO_COMPLETION_HINT=1`.
