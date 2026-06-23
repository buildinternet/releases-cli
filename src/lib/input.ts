import { assertSafeReadPath } from "./validate-input.js";
import { CliError } from "./errors.js";

/**
 * Read content from a file path or stdin.
 *
 * Pass `"-"` to read from stdin; any other value is treated as a file path.
 * The path is hardened first: a `..` traversal segment (the way an agent turns
 * `--batch <file>` into an arbitrary-file read) is rejected before any read.
 *
 * Errors are thrown, not exited on, so they reach the top-level handler — which
 * serializes them to the structured `{ error }` payload under `--json`. A
 * traversal is an `InvalidInputError` (`kind: "invalid_input"`); an unreadable
 * file is a `CliError` (`kind: "error"`), each printed as a clean one-line
 * message in human mode.
 */
export async function readContentArg(pathOrDash: string): Promise<string> {
  if (pathOrDash === "-") return Bun.stdin.text();
  // Outside the try so the typed InvalidInputError propagates as-is rather than
  // being re-wrapped as a read failure.
  assertSafeReadPath(pathOrDash);
  try {
    return await Bun.file(pathOrDash).text();
  } catch (err) {
    throw new CliError(
      `cannot read file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
