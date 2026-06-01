import { Command } from "commander";
import chalk from "chalk";
import { logger } from "@releases/lib/logger";
import {
  findSource,
  backfillSource,
  getBackfillStatus,
  isBackfillAsync,
  type SourceBackfillReport,
  type BackfillAsyncResponse,
} from "../../api/client.js";
import { sourceNotFound } from "../suggest.js";
import { writeJson } from "../../lib/output.js";
import { readContentArg } from "../../lib/input.js";
import { parsePositiveIntFlag } from "../../lib/flags.js";
import { sleep } from "../../lib/sleep.js";
import { renderBackfillReport } from "./backfill-report.js";

type BackfillOpts = {
  maxWindows?: string;
  dryRun?: boolean; // commander: defaults to true; `--no-dry-run` sets false
  commit?: boolean; // alias for --no-dry-run
  markdownFile?: string;
  wait?: boolean; // commander: defaults to true; `--no-wait` sets false
  json?: boolean;
};

// Deep Firecrawl backfills run as a durable workflow (minutes). Poll the status
// endpoint at this cadence until terminal. Single-source backfills finish faster
// than the batch-overview sweep, so poll more often than its 30s.
const POLL_INTERVAL_MS = 5_000;
const TERMINAL_STATUSES = new Set(["complete", "errored", "terminated"]);

export async function backfillAction(identifier: string, opts: BackfillOpts): Promise<void> {
  // Either opt-in writes: `--no-dry-run` (commander sets dryRun:false) or `--commit`.
  const write = opts.dryRun === false || !!opts.commit;
  const dryRun = !write;
  const wait = opts.wait !== false; // poll by default; `--no-wait` opts out
  const maxWindows = parsePositiveIntFlag("max-windows", opts.maxWindows);
  const markdown = opts.markdownFile ? await readContentArg(opts.markdownFile) : undefined;

  // Resolve to the typed src_… ID before calling — the endpoint rejects bare
  // slugs (ambiguous across orgs, #690). findSource() does the org-scoped
  // resolution the other `admin source` verbs use.
  const src = await findSource(identifier);
  if (!src) return sourceNotFound(identifier);

  let res: SourceBackfillReport | BackfillAsyncResponse;
  try {
    res = await backfillSource({ sourceId: src.id, markdown, maxWindows, dryRun });
  } catch (err) {
    // apiFetch embeds the endpoint's actionable message (bare_slug_rejected,
    // non-scrape source, Firecrawl 502, ANTHROPIC/FIRECRAWL key 503, …).
    logger.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  // ── Async path: deep Firecrawl backfill dispatched to a durable workflow ────
  if (isBackfillAsync(res)) {
    if (!wait) {
      if (opts.json) return writeJson(res);
      logger.info(chalk.bold(`Dispatched backfill workflow: ${res.instanceId}`));
      logger.info(chalk.dim(`  status: ${res.statusUrl}`));
      logger.info(chalk.dim(`  Re-run without --no-wait to poll inline, or GET the status URL.`));
      return;
    }

    if (!opts.json) {
      logger.info(chalk.bold(`Dispatched backfill workflow: ${res.instanceId}`));
      logger.info(chalk.dim(`  Polling every ${POLL_INTERVAL_MS / 1000}s until terminal...`));
    }

    let status;
    try {
      // Polling loop — each tick depends on the previous sleep + status fetch.
      // eslint-disable-next-line no-constant-condition
      while (true) {
        // oxlint-disable-next-line no-await-in-loop -- intentional poll cadence
        status = await getBackfillStatus(res.instanceId);
        if (!opts.json) logger.info(chalk.dim(`  status: ${status.status}`));
        if (TERMINAL_STATUSES.has(status.status)) break;
        // oxlint-disable-next-line no-await-in-loop -- intentional poll interval
        await sleep(POLL_INTERVAL_MS);
      }
    } catch (err) {
      logger.error(chalk.red(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }

    if (status.status !== "complete" || !status.output) {
      if (opts.json) await writeJson(status);
      else {
        logger.error(chalk.red(`Workflow ended in non-success state: ${status.status}`));
        if (status.error) logger.error(chalk.red(String(status.error)));
      }
      process.exit(1);
    }

    if (opts.json) return writeJson(status.output);
    renderBackfillReport(status.output);
    return;
  }

  // ── Synchronous path: supplied markdown / plain fetch ───────────────────────
  if (opts.json) return writeJson(res);
  renderBackfillReport(res);
}

export function registerBackfillCommand(program: Command) {
  program
    .command("backfill")
    .description(
      "Full-history backfill for a windowed scrape source (loops extraction over every window)",
    )
    .argument("<identifier>", "Source ID (src_…) or slug")
    .option(
      "--max-windows <n>",
      "Max scrape windows to walk back (endpoint clamps 1–200, default 50)",
    )
    .option("--no-dry-run", "Actually write (default is a dry-run preview)")
    .option("--commit", "Alias for --no-dry-run")
    .option(
      "--markdown-file <path>",
      "Read full-page markdown from a file (use - for stdin) and send it as the body — " +
        "for JS-heavy / bot-blocked sources the worker can't fetch itself. " +
        "Without it the endpoint falls back to Firecrawl (if enabled) then a plain fetch.",
    )
    .option(
      "--no-wait",
      "For deep Firecrawl backfills (dispatched async): print the instance ID and exit instead of polling to completion",
    )
    .option("--json", "Output the raw backfill report as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin source backfill my-source                     Dry-run preview (counts + date range)
  releases admin source backfill my-source --no-dry-run        Write the backfill
  releases admin source backfill my-source --max-windows 100   Walk further back
  releases admin source backfill my-source --no-wait           Async dispatch only (don't poll)
  releases admin source backfill my-source --markdown-file page.md --commit
  cat page.md | releases admin source backfill my-source --markdown-file - --commit`,
    )
    .action(backfillAction);
}
