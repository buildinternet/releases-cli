---
"@buildinternet/releases": minor
---

Improve the release-reader ergonomics for `get`, `latest`/`tail`, and `list` (#303, #304):

- `get <id> --json` now surfaces `media[]` (with the R2-mirrored `r2Url`) when a release has media, plus a `contentTruncated: true` hint so callers know the body was projected to an excerpt and `--full` exists. Previously the slim shape dropped media entirely with no signal it existed, forcing a round-trip to `--full` or the raw API to verify media presence. `--full` is unchanged.
- `latest`/`tail` gain `--limit` (an alias for the existing `--count`) so the absence of `--limit` — which works on other commands — no longer errors with "unknown option". Both clamp to the server's `[1, 100]` window, and a one-shot listing that fills the requested window now prints a truncation hint to stderr (raise `--limit`, narrow with `--since`/`--until`/`--source`/`--org`, or for `--product` feeds, page with the surfaced `--cursor`).
- `latest --product` is cursor-paginated; a new `--cursor` flag pages through it deterministically (the global latest feed has no cursor — it is count-capped — so `--cursor` errors there).
- `releases list` now shows a `Releases` per-source count column in the text table, so "how many releases does this source have?" is answerable without dropping to `--json` (which already carried `releaseCount`) or the raw API.
