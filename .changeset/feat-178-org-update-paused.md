---
"@buildinternet/releases": minor
---

feat(cli): add `--paused` / `--no-paused` flags to `admin org update` for the org-level ingest pause flag landed in [buildinternet/releases#1064](https://github.com/buildinternet/releases/pull/1064). Mirrors the existing `--enable` / `--disable` shape on `admin source update`; lands on the deprecated `edit` alias too. (#178)
