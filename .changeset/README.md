# Changesets

This folder holds pending version bumps. Each PR with user-visible behavior should add a new `.md` file via `bun run changeset`.

Seven `@buildinternet/releases*` packages (`releases`, 4 platform binaries, `releases-lib`, `releases-skills`) are in a `fixed` group so they always bump together. `@buildinternet/releases-core` is published from the private monorepo and is not versioned here — bump its pin in `package.json` when adopting a new schema.
