import chalk from "chalk";

/**
 * Parse a positive-integer CLI flag value. Returns `undefined` if the option
 * was not provided. Exits with code 2 (usage error) on invalid input — matches
 * commander's own conventions for argument errors.
 */
export function parsePositiveIntFlag(label: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    console.error(chalk.red(`Invalid --${label}: must be a positive integer (got ${raw})`));
    process.exit(2);
  }
  return n;
}
