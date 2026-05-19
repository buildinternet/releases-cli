---
"@buildinternet/releases": minor
---

feat(cli): add shell completion support for bash, zsh, and fish. `releases completion <bash|zsh|fish>` prints the script to stdout; `releases completion install` detects the user's shell and writes the script to the conventional location, mirroring how `gh` ships completions. Once the matching tap formula update in buildinternet/buildinternet-homebrew-tap lands, Homebrew will install all three shells automatically — until then, `brew` users should run `releases completion install`. On interactive TTYs, a one-time stderr hint nudges users who haven't installed completions yet — silence with `RELEASES_NO_COMPLETION_HINT=1`.
