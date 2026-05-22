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

/** Relative time-window shorthand accepted by the API: `<n><unit>` (d/w/m/y). */
const TIME_WINDOW_RELATIVE_RE = /^(\d+)([dwmy])$/i;
/**
 * ISO accepted by the API's resolver: a date or a timezone-qualified datetime.
 * Kept in lockstep with `ISO_DATE_RE` in @buildinternet/releases-core/dates so
 * the CLI rejects the same shapes the server would (bare numbers, `2026/01/01`,
 * and tz-less datetimes, which the server parses ambiguously as local time).
 */
const TIME_WINDOW_ISO_RE =
  /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}(:?\d{2})?))?$/;

/**
 * Validate a `--since`/`--until` flag value. The API resolves relative
 * shorthand server-side, so the CLI only fast-fails on obviously-malformed
 * input and forwards the trimmed value verbatim as a query param. Accepts an
 * ISO date (`2026-01-01`), a timezone-qualified datetime (`…Z` / `…+05:00`),
 * or relative shorthand (`90d`, `4w`, `6m`, `2y`). Returns `undefined` when the
 * flag was omitted; exits with code 2 on a malformed value (matches the other
 * flag parsers here). A bare number, `2026/01/01`, and a tz-less datetime are
 * rejected so the local check matches the server contract.
 */
export function parseTimeWindowFlag(label: string, raw: string | undefined): string | undefined {
  if (raw === undefined) return undefined;
  const trimmed = raw.trim();
  const valid =
    TIME_WINDOW_RELATIVE_RE.test(trimmed) ||
    (TIME_WINDOW_ISO_RE.test(trimmed) && !Number.isNaN(new Date(trimmed).getTime()));
  if (!valid) {
    console.error(
      chalk.red(
        `Invalid --${label}: "${raw}" — must be an ISO date (e.g. 2026-01-01) or relative shorthand (90d, 4w, 6m, 2y)`,
      ),
    );
    process.exit(2);
  }
  return trimmed;
}

/** Parse a comma-separated `--tags foo,bar` flag into a trimmed, non-empty list. */
export function parseTagList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Parse a `--metadata-set key=value` token into a `[key, coercedValue]` pair.
 *
 * Value coercion rules (applied in order):
 *   - `true` / `false` / `null`   → JSON literal (boolean / null)
 *   - Finite number string         → number
 *   - Starts with `{` or `[`      → parsed as JSON (exits on invalid JSON)
 *   - Otherwise                    → string
 *
 * Key constraints:
 *   - Must contain `=` (first `=` splits key and value)
 *   - Key must not be empty
 *   - Key must not contain `.` or `[` (nested-path mutation is not supported)
 *
 * Exits with code 2 on any validation failure.
 */
export function parseMetadataSetFlag(raw: string): [string, unknown] {
  const eqIdx = raw.indexOf("=");
  if (eqIdx < 1) {
    console.error(
      chalk.red(
        `Invalid --metadata-set "${raw}": expected key=value (key must be non-empty and separated by "=")`,
      ),
    );
    process.exit(2);
  }
  const key = raw.slice(0, eqIdx);
  const value = raw.slice(eqIdx + 1);

  if (key.includes(".") || key.includes("[")) {
    console.error(
      chalk.red(
        `Invalid --metadata-set key "${key}": nested paths (keys containing "." or "[") are not supported. ` +
          `To mutate nested structure, pass the whole object: --metadata-set ${key}='{"...": "..."}'`,
      ),
    );
    process.exit(2);
  }

  return [key, coerceMetadataValue(value)];
}

/**
 * Coerce a raw CLI string value to the appropriate JSON type.
 * Called by `parseMetadataSetFlag`; also exported for unit-testing.
 */
export function coerceMetadataValue(value: string): unknown {
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;

  // Number: must be finite; guard against the empty-string edge case.
  if (value.length > 0) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }

  // JSON object or array
  if (value.startsWith("{") || value.startsWith("[")) {
    try {
      return JSON.parse(value);
    } catch {
      console.error(
        chalk.red(`Invalid --metadata-set value: could not parse as JSON: ${value.slice(0, 80)}`),
      );
      process.exit(2);
    }
  }

  return value;
}
