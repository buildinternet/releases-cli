import type { Session } from "@buildinternet/releases-api-types";

/**
 * Local extension of `Session` carrying the classification fields added in
 * the registry's API release (api-types ≥ 0.2.0). The pinned api-types is
 * still 0.1.0 — drop this alias and import `Session` directly once the CLI
 * bumps.
 */
export type SessionWithClassification = Session & {
  errorSource?: "provider" | "us";
  errorType?: string;
  stopReason?: string;
  retryCount?: number;
};

export const DEFAULT_WAIT_SECONDS = 900;
export const POLL_INTERVAL_MS = 3_000;
/** Tolerate brief 404s right after starting (StatusHub may lag the workflow trigger). */
export const NOT_FOUND_GRACE_MS = 15_000;

export interface TerminalSummary {
  exitCode: 0 | 1 | 2 | 130;
  status: "complete" | "error" | "cancelled" | "timeout";
  message: string;
}

/**
 * Map a polled session into the exit code + human message the CLI should use.
 * - `0` complete · `1` our-side error · `2` provider error · `130` cancelled
 * - Provider messages are tagged `(managed-agents · <type>)` and include retry
 *   count when the session ended in `retries_exhausted`.
 */
export function classifySessionTerminalState(
  session: SessionWithClassification,
): TerminalSummary | null {
  if (session.status === "running") return null;
  if (session.status === "complete") {
    return { exitCode: 0, status: "complete", message: "Session complete" };
  }
  if (session.status === "cancelled") {
    return { exitCode: 130, status: "cancelled", message: "Session cancelled" };
  }
  const error = session.error ?? "Session error";
  if (session.errorSource === "provider") {
    const typeNote = session.errorType ? ` · ${session.errorType}` : "";
    const retryNote =
      session.stopReason === "retries_exhausted" && session.retryCount !== undefined
        ? ` (after ${session.retryCount} retries)`
        : "";
    return {
      exitCode: 2,
      status: "error",
      message: `Provider error (managed-agents${typeNote})${retryNote}: ${error}`,
    };
  }
  return { exitCode: 1, status: "error", message: error };
}
