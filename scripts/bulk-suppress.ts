#!/usr/bin/env bun
// One-off operator script: bulk-suppress releases listed as NDJSON on stdin.
// Each line: {"id": "rel_…", "reason": "…"}.
// Runs with bounded concurrency to be polite to the API.
//
// Usage:
//   cat suppressions.ndjson | bun scripts/bulk-suppress.ts [--concurrency 8]

import { suppressRelease } from "../src/api/client.ts";

const CONCURRENCY = (() => {
  const idx = process.argv.indexOf("--concurrency");
  if (idx !== -1 && process.argv[idx + 1]) {
    const n = Number(process.argv[idx + 1]);
    if (Number.isFinite(n) && n > 0 && n <= 32) return n;
  }
  return 8;
})();

const stdin = await new Response(Bun.stdin.stream()).text();
const rows = stdin
  .split("\n")
  .filter((l) => l.trim())
  .map((l) => JSON.parse(l) as { id: string; reason?: string });

console.error(`Suppressing ${rows.length} releases (concurrency=${CONCURRENCY})…`);

let ok = 0;
let fail = 0;
const errors: Array<{ id: string; err: string }> = [];

async function worker(queue: typeof rows) {
  while (queue.length > 0) {
    const row = queue.shift();
    if (!row) break;
    try {
      await suppressRelease(row.id, row.reason);
      ok++;
    } catch (err) {
      fail++;
      errors.push({ id: row.id, err: err instanceof Error ? err.message : String(err) });
    }
    if ((ok + fail) % 25 === 0) {
      console.error(`  progress: ok=${ok} fail=${fail}`);
    }
  }
}

const queue = [...rows];
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(queue)));

console.error(`DONE. ok=${ok} fail=${fail}`);
if (errors.length) {
  console.error("Errors (first 5):");
  for (const e of errors.slice(0, 5)) console.error(`  ${e.id}: ${e.err}`);
}
process.exit(fail > 0 ? 1 : 0);
