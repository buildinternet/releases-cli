---
"@buildinternet/releases": minor
---

Add `releases publish` so GitLab CI, Buildkite, and local docs builds can push changelog updates with `RELEASES_API_TOKEN`, using the same plan as the publish-changelog GitHub Action.

`releases json validate` accepts `publish: "push"` changelog locators from the current releases.json schema.
