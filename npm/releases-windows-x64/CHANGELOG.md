# @buildinternet/releases-windows-x64

## 0.23.0

### Minor Changes

- c80aacb: feat(cli): publish a Windows x64 binary. `npm install -g @buildinternet/releases` now works on Windows; the dispatcher resolves `releases.exe` from the new `@buildinternet/releases-windows-x64` platform package. Homebrew remains macOS/Linux-only. `windows-arm64` is intentionally not shipped — open an issue if you need it.
