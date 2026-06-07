---
"@buildinternet/releases": minor
---

feat(admin): `releases admin user set-role | get-role | list-roles` (#288)

Add CLI verbs to manage user roles — the OAuth scope-entitlement source of truth (`user`→read, `curator`→read+write, `admin`→read+write+admin) — wrapping the root-key-gated `/v1/admin/users/role` routes from buildinternet/releases#1485. `set-role` shows `previousRole → role`; `get-role` reads one user; `list-roles` lists curator/admin users. Backfills the changeset omitted when #288 merged.
