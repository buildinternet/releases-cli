/**
 * Typed CLI errors + a structured JSON error payload.
 *
 * Agents that invoke the CLI with `--json` expect a parseable payload on the
 * happy path; an unstructured stderr dump on the failure path forces them to
 * fall back to brittle string-matching exactly when they most need to branch.
 * `ApiError` / `InvalidInputError` carry machine-readable fields, and
 * `toErrorPayload` renders any thrown value into a stable `{ error: … }` shape
 * (emitted to stdout by the top-level handler when `--json` is set).
 */

/** A non-2xx response from the Releases API. Message format is preserved for
 * the existing `/API error \(NNN\) on METHOD path/` characterization tests. */
export class ApiError extends Error {
  readonly status: number;
  readonly method: string;
  readonly path: string;
  /** The server-provided message (without the `API error (…)` envelope). */
  readonly serverMessage: string;

  constructor(opts: { status: number; method: string; path: string; serverMessage: string }) {
    super(`API error (${opts.status}) on ${opts.method} ${opts.path}: ${opts.serverMessage}`);
    this.name = "ApiError";
    this.status = opts.status;
    this.method = opts.method;
    this.path = opts.path;
    this.serverMessage = opts.serverMessage;
  }
}

/** A user-supplied identifier or path that failed input hardening (control
 * characters, traversal, embedded query/fragment, percent-encoding). Thrown
 * before any network or filesystem access. */
export class InvalidInputError extends Error {
  readonly field: string;

  constructor(field: string, reason: string) {
    super(`Invalid ${field}: ${reason}`);
    this.name = "InvalidInputError";
    this.field = field;
  }
}

export type CliErrorPayload = {
  error: {
    kind: "api" | "invalid_input" | "error";
    message: string;
    status?: number;
    method?: string;
    path?: string;
    field?: string;
  };
};

/** Render any thrown value into the stable structured error payload. */
export function toErrorPayload(err: unknown): CliErrorPayload {
  if (err instanceof ApiError) {
    return {
      error: {
        kind: "api",
        message: err.serverMessage,
        status: err.status,
        method: err.method,
        path: err.path,
      },
    };
  }
  if (err instanceof InvalidInputError) {
    return { error: { kind: "invalid_input", message: err.message, field: err.field } };
  }
  return { error: { kind: "error", message: err instanceof Error ? err.message : String(err) } };
}
