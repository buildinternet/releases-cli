---
"@buildinternet/releases": patch
---

Set +x on the cross-compiled platform binaries before they're gzipped for distribution. Bun's `--compile` produces 0644 outputs for cross-targets on Linux runners, so the Homebrew formula's `bin.install` (which preserves source mode) landed a non-executable binary. v0.38.0 added a completion-generation step that exec'd the binary during install and failed with EACCES; the formula template now also chmods the binary defensively before install.
