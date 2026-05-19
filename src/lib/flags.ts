import chalk from "chalk";

/**
 * Parse a positive-integer CLI flag value. Returns `undefined` if the option
 * was not provided. Exits with code 2 (usage error) on invalid input — matches
 * commander's own conventions for argument errors.
 */
export function parsePositiveIntFlag(label: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  // Strict integer match first — Number.parseInt would silently accept "1.5" → 1
  // and "10abc" → 10. Allow an optional leading minus so the range check below
  // produces the same error message for "-1" as it does for "1.5".
  const isInt = /^-?\d+$/.test(raw);
  const n = isInt ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) {
    console.error(chalk.red(`Invalid --${label}: must be a positive integer (got ${raw})`));
    process.exit(2);
  }
  return n;
}

/**
 * Parse a non-negative-integer CLI flag value (0 is allowed). Returns
 * `undefined` if the option was not provided. Exits with code 2 on invalid
 * input.
 */
export function parseNonNegIntFlag(label: string, raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  // Strict integer match first — Number.parseInt would silently accept "1.5" → 1
  // and "10abc" → 10. Allow an optional leading minus so the range check below
  // produces the same error message for "-1" as it does for "1.5".
  const isInt = /^-?\d+$/.test(raw);
  const n = isInt ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(n) || n < 0) {
    console.error(chalk.red(`Invalid --${label}: must be a non-negative integer (got ${raw})`));
    process.exit(2);
  }
  return n;
}

/** Parse a comma-separated `--tags foo,bar` flag into a trimmed, non-empty list. */
export function parseTagList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}
