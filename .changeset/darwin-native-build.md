---
"@buildinternet/releases": patch
"@buildinternet/releases-darwin-arm64": patch
"@buildinternet/releases-darwin-x64": patch
"@buildinternet/releases-linux-arm64": patch
"@buildinternet/releases-linux-x64": patch
"@buildinternet/releases-core": patch
"@buildinternet/releases-lib": patch
"@buildinternet/releases-skills": patch
---

Pin CI to bun canary to pick up oven-sh/bun#29272 — fixes `bun build --compile` producing Mach-O binaries that Apple Silicon SIGKILLs on exec due to a broken LC_CODE_SIGNATURE size in bun 1.3.12. Also fixes the Homebrew formula install block to handle the platform-suffixed binary name.
