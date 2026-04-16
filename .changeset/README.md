# Changesets

This folder holds pending version bumps. Each PR with user-visible behavior should add a new `.md` file via `bun run changeset`.

The five `@buildinternet/releases*` binary packages are in a `fixed` group so they always bump together. The three shared packages (`releases-core`, `releases-lib`, `releases-skills`) version independently.
