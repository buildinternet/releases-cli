import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { expandHome } from "@releases/lib/config";

/**
 * Admin-mutation log. When `RELEASES_RUN_DIR` is set (the maintenance skill
 * exports it once per batch), every operator write the CLI makes appends one
 * JSONL line to `$RELEASES_RUN_DIR/mutations.jsonl`. Unset → no-op. Fully
 * fail-open: a logging failure must never break the write it was recording.
 *
 * The chokepoint is the api-client's `apiFetch` (see `src/api/client.ts`), so
 * the gate keys on the HTTP verb rather than per-command wiring.
 *
 * See `docs/architecture/maintenance-workspace.md` in the monorepo.
 */

const RUN_DIR_ENV = "RELEASES_RUN_DIR";
const MUTATIONS_FILE = "mutations.jsonl";

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Endpoints that use a mutating verb but aren't operator state changes —
 * session heartbeats, usage/fetch telemetry, and read-via-POST checks. Kept
 * out so mutations.jsonl stays a clean ledger of what actually changed.
 */
const PLUMBING_PATTERNS = ["/status/event", "/logs/usage", "/logs/fetch", "/content-hash"];

export interface MutationOutcome {
  method: string;
  path: string;
  ok: boolean;
  status?: number;
  error?: string;
}

export interface MutationRecord {
  timestamp: string;
  command: string;
  target: string;
  result: string;
}

function isPlumbing(path: string): boolean {
  return PLUMBING_PATTERNS.some((p) => path.includes(p));
}

/** Cheap gate so `apiFetch` skips all work on the common (env-unset) path. */
export function shouldRecordMutation(method: string | undefined, path: string): boolean {
  if (!process.env[RUN_DIR_ENV]) return false;
  if (!method || !MUTATING_METHODS.has(method.toUpperCase())) return false;
  if (isPlumbing(path)) return false;
  return true;
}

/** The CLI invocation, minus the runtime + script path. Pure for testing. */
export function currentCommand(argv: string[] = process.argv): string {
  return argv.slice(2).join(" ").trim() || "(root)";
}

export function buildMutationRecord(
  outcome: MutationOutcome,
  command: string,
  timestamp: string,
): MutationRecord {
  const status = outcome.status ? ` ${outcome.status}` : "";
  const result = outcome.ok
    ? `ok${status}`
    : `error${status}${outcome.error ? `: ${outcome.error}` : ""}`;
  return {
    timestamp,
    command,
    target: `${outcome.method.toUpperCase()} ${outcome.path}`,
    result,
  };
}

export function recordMutation(outcome: MutationOutcome): void {
  try {
    const runDir = process.env[RUN_DIR_ENV];
    if (!runDir) return;
    const record = buildMutationRecord(outcome, currentCommand(), new Date().toISOString());
    const file = join(expandHome(runDir), MUTATIONS_FILE);
    mkdirSync(dirname(file), { recursive: true });
    appendFileSync(file, JSON.stringify(record) + "\n");
  } catch {
    // Fail-open: never break a write because logging failed.
  }
}
