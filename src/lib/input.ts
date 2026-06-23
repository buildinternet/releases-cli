import { logger } from "@releases/lib/logger";
import { assertSafeReadPath } from "./validate-input.js";
import { InvalidInputError } from "./errors.js";

/**
 * Read content from a file path or stdin.
 *
 * Pass `"-"` to read from stdin; any other value is treated as a file path.
 * Throws a clean, actionable error (and exits 1) when the file cannot be read.
 * The path is hardened first: a `..` traversal segment (the way an agent turns
 * `--batch <file>` into an arbitrary-file read) is rejected before any read.
 */
export async function readContentArg(pathOrDash: string): Promise<string> {
  if (pathOrDash === "-") return Bun.stdin.text();
  try {
    assertSafeReadPath(pathOrDash);
    return await Bun.file(pathOrDash).text();
  } catch (err) {
    if (err instanceof InvalidInputError) {
      logger.error(err.message);
      process.exit(1);
    }
    logger.error(
      `cannot read file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}
