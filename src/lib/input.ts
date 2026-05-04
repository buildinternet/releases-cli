import { logger } from "@releases/lib/logger";

/**
 * Read content from a file path or stdin.
 *
 * Pass `"-"` to read from stdin; any other value is treated as a file path.
 * Throws a clean, actionable error (and exits 1) when the file cannot be read.
 */
export async function readContentArg(pathOrDash: string): Promise<string> {
  if (pathOrDash === "-") return Bun.stdin.text();
  try {
    return await Bun.file(pathOrDash).text();
  } catch (err) {
    logger.error(
      `cannot read file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(1);
  }
}

/**
 * Resolve a deprecated inline-string flag and its `--*-file` replacement to a
 * single payload string.
 *
 * - Errors and exits 1 if both forms are provided (mutually exclusive).
 * - Reads the file (or stdin when `"-"`) when `file` is set.
 * - Warns once that the inline form is deprecated when only `inline` is set.
 * - Returns `undefined` if neither form was provided.
 *
 * Used by `--notes` / `--notes-file` (admin playbook) and
 * `--parse-instructions` / `--parse-instructions-file` (source update).
 */
export async function resolveInlineOrFile(args: {
  inline: string | undefined;
  file: string | undefined;
  inlineName: string;
  fileName: string;
}): Promise<string | undefined> {
  const { inline, file, inlineName, fileName } = args;

  if (inline !== undefined && file !== undefined) {
    logger.error(`${inlineName} and ${fileName} are mutually exclusive`);
    process.exit(1);
  }
  if (file !== undefined) {
    return readContentArg(file);
  }
  if (inline !== undefined) {
    logger.warn(
      `"${inlineName}" is deprecated, use "${fileName} <path>" (use - for stdin); the inline form will be removed in a future release.`,
    );
    return inline;
  }
  return undefined;
}
