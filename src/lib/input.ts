import chalk from "chalk";

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
    console.error(
      chalk.red(
        `Error: cannot read file "${pathOrDash}": ${err instanceof Error ? err.message : String(err)}`,
      ),
    );
    process.exit(1);
  }
}
