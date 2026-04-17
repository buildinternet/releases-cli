---
"@buildinternet/releases": patch
---

Include README in the published npm tarball so the package page on npmjs.com renders install + usage docs. A `prepack` script copies the repo-root README into the package directory at publish time.
