# Plan 004: Harden credential file permissions on Windows

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving on. If
> anything in "STOP conditions" occurs, stop and report. When done, update the
> status row for this plan in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat eccfd5f..HEAD -- src/lib/credentials.ts`
> If `src/lib/credentials.ts` changed, compare "Current state" against live code;
> on mismatch, STOP.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `eccfd5f`, 2026-06-18

## Why this matters

The CLI stores a long-lived API token (and, when present, an account-managing
device-session token) at `~/.releases/credentials`. `writeCredential` protects it
with `chmodSync(path, 0o600)` — correct on macOS/Linux. **On Windows, `chmod` is
effectively a no-op**: NTFS doesn't honor Unix permission bits, so the file lands
with default (often inheritable) ACLs. On a shared/multi-user Windows machine,
another local user can read the credential file and assume the victim's API
scope. The CLI ships a Windows binary (`build:windows-x64` in `package.json`), so
this is a real target platform. This plan adds Windows ACL hardening that
restricts the file to the current user, leaving the existing Unix path untouched.

## Current state

- `src/lib/credentials.ts` — credential persistence. Full writer:

  ```ts
  // src/lib/credentials.ts:66-75
  export function writeCredential(cred: StoredCredential): void {
    const path = credentialPath();
    mkdirSync(dirname(path), { recursive: true });
    // Atomic write: temp file + rename so a crash never leaves a partial file.
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, JSON.stringify(cred, null, 2), { mode: 0o600 });
    chmodSync(tmp, 0o600);
    renameSync(tmp, path);
    chmodSync(path, 0o600);
  }
  ```

  Imports currently in the file:

  ```ts
  // src/lib/credentials.ts:1-11
  import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    renameSync,
    rmSync,
    writeFileSync,
  } from "node:fs";
  import { dirname, join } from "node:path";
  import { getDataDir } from "@releases/lib/config";
  ```

- `StoredCredential` (lines 13-27) holds `token` and an optional broader
  `sessionToken` — both sensitive (the comment notes `sessionToken` "can manage
  the account").

- **Convention to follow — inject `platform` for testability**: the repo already
  does this. See `src/lib/open-browser.ts:18`:

  ```ts
  export function openBrowser(url: string, platform: NodeJS.Platform = process.platform): boolean {
  ```

  and its branches at lines 8-9 (`platform === "darwin"`, `platform === "win32"`).
  Mirror that signature so the Windows path is unit-testable without running on
  Windows.

- **Shell-out convention**: the repo shells out with array-args (never string
  interpolation) — see `src/lib/open-browser.ts` and `src/cli/commands/skills.ts`.
  Follow it: build `icacls` args as an array and use a spawn API that takes
  `(cmd, args[])`.

## Commands you will need

| Purpose   | Command                                   | Expected on success |
| --------- | ----------------------------------------- | ------------------- |
| Typecheck | `bun run typecheck`                       | exit 0              |
| Tests     | `bun test tests/unit/credentials.test.ts` | all pass            |
| Lint      | `bun run lint`                            | exit 0              |

## Scope

**In scope**:

- `src/lib/credentials.ts`
- `tests/unit/credentials.test.ts` (exists — extend it)

**Out of scope**:

- `readCredential` / `clearCredential` — leave as is.
- The atomic temp-file + rename flow — keep it; only ADD Windows hardening after
  the rename.
- The data-dir location logic (`getDataDir`).
- Do NOT pull in a new dependency for ACLs — use the built-in `icacls` Windows
  tool via the existing spawn convention.

## Git workflow

- Branch: `advisor/004-windows-credential-perms`
- Commit: `fix(credentials): restrict credential file ACL on Windows`
- Add a `patch` changeset.
- Do NOT push or open a PR unless instructed.

## Steps

### Step 1: Add a Windows ACL hardening helper

In `src/lib/credentials.ts`, add a helper that, on `win32`, resets the file's
ACLs to grant only the current user. The standard approach uses the built-in
`icacls`:

- `icacls <path> /inheritance:r` — remove inherited ACEs.
- `icacls <path> /grant:r <user>:F` — grant the current user Full control only.

Where `<user>` is `process.env.USERNAME` (or `USERDOMAIN\USERNAME` when
available). Build args as an array and run synchronously. Use Bun's
`spawnSync`-equivalent or `node:child_process` `execFileSync` (array args, no
shell) — match whatever `src/lib/open-browser.ts` imports. Fail **soft**: if the
`icacls` calls error (older Windows, unusual environment), log a warning via the
repo logger (`@releases/lib/logger`) and continue — a hardening best-effort must
not break login.

Target shape:

```ts
function hardenWindowsAcl(path: string): void {
  const user = process.env.USERDOMAIN
    ? `${process.env.USERDOMAIN}\\${process.env.USERNAME}`
    : process.env.USERNAME;
  if (!user) return; // can't identify the user; leave default ACLs
  try {
    execFileSync("icacls", [path, "/inheritance:r"], { stdio: "ignore" });
    execFileSync("icacls", [path, "/grant:r", `${user}:F`], { stdio: "ignore" });
  } catch (err) {
    logger.warn(`Could not restrict credential file permissions on Windows: ${String(err)}`);
  }
}
```

(Adjust the import for `execFileSync` / logger to match repo style — check how
`src/lib/open-browser.ts` and other `src/lib/*` files import child_process and the
logger.)

**Verify**: `bun run typecheck` → exit 0.

### Step 2: Wire it into writeCredential with an injectable platform

Change the signature to accept an injectable platform (defaulting to
`process.platform`, mirroring `open-browser.ts`), and call the helper on Windows
after the final rename:

```ts
export function writeCredential(
  cred: StoredCredential,
  platform: NodeJS.Platform = process.platform,
): void {
  const path = credentialPath();
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cred, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600); // no-op on Windows, harmless
  if (platform === "win32") hardenWindowsAcl(path);
}
```

Keep all existing callers working — the new param is optional, so no call site
needs to change.

**Verify**: `bun run typecheck` → exit 0; `grep -rn "writeCredential(" src` shows
all existing call sites still compile (none pass a second arg).

### Step 3: Add tests

In `tests/unit/credentials.test.ts`:

- **Unix path unchanged**: calling `writeCredential(cred, "darwin")` (or
  `"linux"`) writes the file under a temp `getDataDir()` and does NOT invoke
  `icacls`. To avoid actually shelling out, factor the `execFileSync` call behind
  a module-level binding you can spy on, OR assert indirectly: on a non-win32
  platform the function completes and the file exists with the expected content.
  (Don't over-engineer — the key assertion is "non-Windows behavior is
  byte-for-byte unchanged.")
- **Windows path attempts hardening**: calling `writeCredential(cred, "win32")`
  in the test environment (which is not Windows) should still not throw — the
  `icacls` call fails and is swallowed by the soft-fail catch, and the file is
  still written. Assert the file exists and the function returned without
  throwing.

Use the temp-dir pattern from `tests/unit/api-client.test.ts` (top-of-file
`mkdtempSync`/`tmpdir`/`rmSync`) and point `getDataDir()` at it via the same env
mechanism the existing `credentials.test.ts` uses (read that file first to match
its setup — it likely sets `RELEASES_DATA_DIR` or an XDG var).

**Verify**: `bun test tests/unit/credentials.test.ts` → all pass.

### Step 4: Final checks

**Verify**:

- `bun run lint` → exit 0
- `git status --porcelain` → only `src/lib/credentials.ts`,
  `tests/unit/credentials.test.ts`, one `.changeset/*.md`.

## Test plan

- New tests in `tests/unit/credentials.test.ts`: non-Windows write is unchanged
  (file exists, correct content, no throw); Windows write soft-fails on `icacls`
  yet still persists the file without throwing.
- Pattern: existing `tests/unit/credentials.test.ts` setup + the temp-dir
  approach from `tests/unit/api-client.test.ts`.
- Verification: `bun test tests/unit/credentials.test.ts` → all pass.

## Done criteria

- [ ] `bun run typecheck` exits 0
- [ ] `bun test tests/unit/credentials.test.ts` passes with the new cases
- [ ] `writeCredential` takes an optional `platform` param and calls
      `hardenWindowsAcl` only on `"win32"`
- [ ] All existing `writeCredential(` call sites still compile unchanged
- [ ] No files outside the in-scope list modified
- [ ] A `patch` changeset exists
- [ ] `plans/README.md` status row updated

## STOP conditions

Stop and report if:

- `writeCredential` no longer matches the "Current state" excerpt (drift).
- You cannot determine, from reading `tests/unit/credentials.test.ts`, how the
  test suite points `getDataDir()` at a temp location — stop rather than writing
  to the real `~/.releases`.
- The repo already has Windows ACL handling here — mark REJECTED.
- Implementing this would require adding a third-party dependency — STOP; the
  plan mandates the built-in `icacls`, and a dep needs maintainer sign-off.

## Maintenance notes

- `icacls` is present on all supported Windows versions. If a future Windows
  build environment lacks it, the soft-fail keeps login working (just unhardened).
- A stronger future option is the Windows Credential Manager (DPAPI), which would
  also encrypt at rest — deliberately deferred here as a larger change; the ACL
  restriction closes the same-machine read vector with no new dependency.
- Reviewer: confirm the credential token value is never passed to `icacls` or
  logged — only the file _path_ and the username reach the shell-out.
