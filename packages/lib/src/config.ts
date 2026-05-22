import { mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { legacyEnv } from "./legacy-env";

let _dataDir: string | null = null;

export function getDataDir(): string {
  if (!_dataDir) {
    _dataDir = legacyEnv("RELEASES_DATA_DIR", "RELEASED_DATA_DIR") || join(homedir(), ".releases");
    mkdirSync(_dataDir, { recursive: true });
  }
  return _dataDir;
}

export function getLogsDir(): string {
  const dir = join(getDataDir(), "logs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Maintenance workspace root (`<dataDir>/work`). Home of the agent-driven
 * admin maintenance trail — `tasks/`, `runs/`, `reports/`. See
 * `docs/architecture/maintenance-workspace.md` in the monorepo.
 */
export function getWorkDir(): string {
  const dir = join(getDataDir(), "work");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Per-run evidence dir (`<dataDir>/work/runs`) — session traces land here. */
export function getRunsDir(): string {
  const dir = join(getWorkDir(), "runs");
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Expand a leading `~` / `~/` to the home dir. A shell `export FOO=~/x`
 * expands the tilde at assignment time, but a quoted `FOO="~/x"` does not —
 * so workspace paths read from env (e.g. `RELEASES_RUN_DIR`) may arrive
 * tilde-prefixed. Only the leading `~` is handled; `~user` is left intact.
 */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/")) return join(homedir(), p.slice(2));
  return p;
}
