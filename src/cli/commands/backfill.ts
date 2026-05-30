import { Command } from "commander";
import chalk from "chalk";
import { logger } from "@releases/lib/logger";
import { findSource, backfillSource } from "../../api/client.js";
import { sourceNotFound } from "../suggest.js";
import { writeJson } from "../../lib/output.js";
import { readContentArg } from "../../lib/input.js";
import { parsePositiveIntFlag } from "../../lib/flags.js";

type BackfillOpts = {
  maxWindows?: string;
  dryRun?: boolean; // commander: defaults to true; `--no-dry-run` sets false
  commit?: boolean; // alias for --no-dry-run
  markdownFile?: string;
  json?: boolean;
};

/** ISO timestamp → YYYY-MM-DD, or an em dash when the bound is null. */
function shortDate(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "—";
}

export async function backfillAction(identifier: string, opts: BackfillOpts): Promise<void> {
  // `--no-dry-run` (commander → dryRun:false) or `--commit` both opt into writing.
  const dryRun = opts.dryRun !== false && !opts.commit;
  const maxWindows = parsePositiveIntFlag("max-windows", opts.maxWindows);
  const markdown = opts.markdownFile ? await readContentArg(opts.markdownFile) : undefined;

  // Resolve to the typed src_… ID before calling — the endpoint rejects bare
  // slugs (ambiguous across orgs, #690). findSource() does the org-scoped
  // resolution the other `admin source` verbs use.
  const src = await findSource(identifier);
  if (!src) return sourceNotFound(identifier);

  let report;
  try {
    report = await backfillSource({ sourceId: src.id, markdown, maxWindows, dryRun });
  } catch (err) {
    // apiFetch embeds the endpoint's actionable message (bare_slug_rejected,
    // non-scrape source, Firecrawl 502, ANTHROPIC/FIRECRAWL key 503, …).
    logger.error(chalk.red(err instanceof Error ? err.message : String(err)));
    process.exit(1);
  }

  if (opts.json) {
    await writeJson(report);
    return;
  }

  const dates = `${shortDate(report.dateRange.from)} … ${shortDate(report.dateRange.to)}`;

  if (report.dryRun) {
    logger.info(
      `dry run: ${report.windows} window(s), ${report.extracted} extracted → ${report.deduped} unique, ` +
        `dates ${dates}, via ${report.via} (nothing written)`,
    );
    logger.info(chalk.dim(`Re-run with --no-dry-run (or --commit) to write.`));
  } else {
    logger.info(
      chalk.green(
        `backfilled ${report.inserted} release(s) (${report.deduped} submitted, ${report.found} seen) for ${report.source.slug}`,
      ),
    );
    logger.info(chalk.dim(`${report.windows} window(s), dates ${dates}, via ${report.via}`));
  }

  if (report.cappedAtWindow || report.droppedChars > 0) {
    logger.warn(
      chalk.yellow(
        `Hit the window cap at ${report.windows} window(s); dropped ~${report.droppedChars.toLocaleString()} ` +
          `chars of older history. Raise --max-windows (endpoint max 200) to reach further back.`,
      ),
    );
  }
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
    .option("--json", "Output the raw backfill report as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin source backfill my-source                     Dry-run preview (counts + date range)
  releases admin source backfill my-source --no-dry-run        Write the backfill
  releases admin source backfill my-source --max-windows 100   Walk further back
  releases admin source backfill my-source --markdown-file page.md --commit
  cat page.md | releases admin source backfill my-source --markdown-file - --commit`,
    )
    .action(backfillAction);
}
