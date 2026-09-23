---
"@buildinternet/releases": patch
---

Fix the macOS binaries being killed on launch. They are now built on macOS and ad-hoc code-signed; v0.77.0 and v0.78.0 shipped with invalid signatures, which macOS 27 enforces (`brew upgrade` failed while generating shell completions).
