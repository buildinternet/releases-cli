/**
 * Write a value as pretty-printed JSON to stdout, awaiting drain when the
 * write buffer is full.
 *
 * When stdout is a pipe, Node/Bun's `process.stdout.write` is non-blocking
 * and returns `false` once the internal buffer (~96 KB) fills. `console.log`
 * doesn't await drain, so if the CLI process exits before the kernel pipe
 * buffer has drained, tail bytes are silently dropped. This manifests as
 * truncated JSON when a caller pipes `--json` output into `jq`, `cat`, etc.
 *
 * Always use this helper instead of `console.log(JSON.stringify(...))` for
 * machine-readable output.
 */
export async function writeJson(value: unknown): Promise<void> {
  const out = JSON.stringify(value, null, 2) + "\n";
  if (!process.stdout.write(out)) {
    await new Promise<void>((resolve) => process.stdout.once("drain", resolve));
  }
}

/** Compact single-line JSON (for streaming NDJSON-style output). */
export async function writeJsonLine(value: unknown): Promise<void> {
  const out = JSON.stringify(value) + "\n";
  if (!process.stdout.write(out)) {
    await new Promise<void>((resolve) => process.stdout.once("drain", resolve));
  }
}
