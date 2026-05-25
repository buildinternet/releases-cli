---
"@buildinternet/releases": minor
---

Add `releases admin work start <batch>` / `status` / `end` and a sticky run-dir pointer for the maintenance workspace. `RELEASES_RUN_DIR` auto-captures admin mutations into `mutations.jsonl` and defaults the managed-session trace dir, but a one-time `export` doesn't survive an agent harness (each shell is fresh), so logging silently stopped after the first command. `work start` creates `~/.releases/work/runs/<ts>-<batch>/` (honoring `RELEASES_DATA_DIR`) and writes a sticky `~/.releases/work/.current-run` pointer; the CLI now resolves the active run as `RELEASES_RUN_DIR` env → `.current-run` pointer → none, so mutation logging and the trace-dir default work across separate invocations with no env threading. Explicit `RELEASES_RUN_DIR` still wins. `work status` prints the run dir, where it came from, and a mutations/sessions tally; `work end` clears the pointer.
