---
"@buildinternet/releases": patch
---

fix(cli): reject partial integers in parsePositiveIntFlag — "1.5" and "10abc" no longer silently truncate to 1 and 10 (#177)
