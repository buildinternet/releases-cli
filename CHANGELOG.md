# Changelog

All notable changes to this project are documented here. Versions apply to the published npm packages (`@buildinternet/releases`, `@buildinternet/releases-lib`, `@buildinternet/releases-skills`, and the per-platform binaries) and the matching Git tags / GitHub releases.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.19.0] — 2026-04-21

### Changed

- **Skills** — synced prose to the monorepo's tool-consolidation work (upstream issue [buildinternet/releases#459](https://github.com/buildinternet/releases/issues/459)). Deprecated per-action tool names are replaced with the consolidated equivalents throughout the skill bundle:
  - `add_source` / `edit_source` / `remove_source` / `fetch_source` → `manage_source` with `action` parameter
  - `get_playbook` / `update_playbook_notes` → `manage_playbook` with `action` parameter
  - `list_categories` — retired; valid categories are now surfaced via `manage_org` / `manage_product` tool descriptions and system prompts
- `managing-sources` skill — expanded Primary Sources section with conditional `is_primary` guidance, added a note about the slug auto-suffix behavior on `manage_source(add)`, and ported the Organization Descriptions + Embedding Side Effects subsections from upstream.
- `seeding-playbooks` skill — replaced the `releases admin content playbook` CLI path with `releases admin playbook` (the `content` subgroup was removed in an earlier CLI pass) and ported the "What a playbook is" framing from upstream.
- `parsing-changelogs` skill — six call-site updates to match the consolidated surface.

### Fixed

- `finding-changelogs` and `parsing-changelogs` skills — corrected the playbook CLI command path (`admin content playbook` → `admin playbook`).

## [0.18.0] and earlier

Releases prior to 0.19.0 are tagged in Git (`v0.18.0`, `v0.17.0`, …) and published to npm, but do not have entries in this changelog. See Git history for details.

[Unreleased]: https://github.com/buildinternet/releases-cli/compare/v0.19.0...HEAD
[0.19.0]: https://github.com/buildinternet/releases-cli/compare/v0.18.0...v0.19.0
