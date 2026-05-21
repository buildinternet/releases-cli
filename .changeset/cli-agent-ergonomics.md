---
"@buildinternet/releases": patch
---

Better unknown-command suggestions, `--help` examples, and a `sources` alias for `list`.

- **Unknown-command suggestions:** `releases serch foo` now prints `(Did you mean search?)` instead of the misleading "too many arguments" error. Root cause was the root `.action()` swallowing unrecognised tokens before Commander's suggestion engine could fire; fixed by allowing excess args on the root and delegating to `unknownCommand()`.
- **`releases sources` alias:** `releases list` now accepts `sources` as an alias, so `releases sources --kind sdk` works. The alias is top-level only — `releases admin source` is unchanged.
- **`--help` examples:** Added `Examples:` blocks to `list`, `search`, `admin source update`, `admin product create`, and `admin product update`.
