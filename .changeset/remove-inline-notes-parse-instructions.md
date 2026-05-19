---
"@buildinternet/releases": minor
---

Remove deprecated `--notes` and `--parse-instructions` inline flags (Phase 2 of #103).

Both flags were deprecated in Phase 1 (#118) with file-based replacements. They are now removed; passing either flag exits non-zero with `unknown option`. Use `--notes-file` and `--parse-instructions-file` (or `-` for stdin) instead.
