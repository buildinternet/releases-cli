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

Build darwin binaries on a macOS runner and ad-hoc sign them. Cross-compiling from Linux produced Mach-O binaries without a code signature, which Apple Silicon SIGKILLs on exec — breaking `brew install buildinternet/tap/releases`. Also fixes the Homebrew formula install block to handle the platform-suffixed binary name.
