import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { findSource, getFetchLogs } from "../../api/client.js";
import { timeAgo } from "@buildinternet/releases-core/dates";
import { stripAnsi } from "../../lib/sanitize.js";
import { writeJson } from "../../lib/output.js";
import { sourceNotFound } from "../suggest.js";

export function registerFetchLogCommand(program: Command) {
  program
    .command("fetch-log [source]")
    .description("Show fetch history for sources")
    .option("--limit <n>", "Number of log entries", "20")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin source fetch-log                 Show recent fetch history
  releases admin source fetch-log my-source       Show history for one source (slug or src_…)
  releases admin source fetch-log --limit 50
  releases admin source fetch-log --json`,
    )
    .action(async (source: string | undefined, opts: { limit?: string; json?: boolean }) => {
      const limit = parseInt(opts.limit ?? "20", 10);
      // The /v1/admin/logs/fetch query param resolves typed IDs and bare slugs
      // only — `org/slug` coordinates 404 there. Round-trip through findSource
      // first so every shape the CLI advertises lands cleanly. Pass the
      // canonical typed ID downstream to short-circuit ambiguous-slug cases.
      let resolvedSource: string | undefined;
      if (source) {
        const found = await findSource(source);
        if (!found) return sourceNotFound(source);
        resolvedSource = found.id;
      }
      const logs = await getFetchLogs({ source: resolvedSource, limit });

      if (logs.length === 0) {
        if (opts.json) {
          await writeJson([]);
        } else {
          console.log("No fetch logs found.");
        }
        return;
      }

      if (opts.json) {
        await writeJson(logs);
        return;
      }

      const table = new Table({
        head: [
          chalk.cyan("Source"),
          chalk.cyan("Status"),
          chalk.cyan("Found"),
          chalk.cyan("Inserted"),
          chalk.cyan("Duration"),
          chalk.cyan("Error"),
          chalk.cyan("When"),
        ],
      });

      for (const log of logs) {
        const statusLabel =
          log.status === "dry_run"
            ? chalk.magenta("dry run")
            : log.status === "success"
              ? chalk.green("success")
              : log.status === "error"
                ? chalk.red("error")
                : chalk.dim("no change");

        const errorText = log.error
          ? chalk.red(stripAnsi(log.error.length > 40 ? log.error.slice(0, 40) + "..." : log.error))
          : chalk.dim("—");

        const sourceLabel = log.sourceName
          ? `${stripAnsi(log.sourceName)} ${chalk.dim(`(${log.sourceSlug})`)}`
          : log.sourceSlug || chalk.dim("—");
        table.push([
          sourceLabel,
          statusLabel,
          String(log.releasesFound),
          log.releasesInserted > 0 ? chalk.green(String(log.releasesInserted)) : chalk.dim("0"),
          log.durationMs ? `${(log.durationMs / 1000).toFixed(1)}s` : chalk.dim("—"),
          errorText,
          timeAgo(log.createdAt) ?? "—",
        ]);
      }

      console.log(table.toString());
      const hint = source
        ? `  More: "releases get ${source}" for source details · "releases admin source fetch ${source}" to re-fetch`
        : `  More: "releases admin source fetch-log <source>" to filter by source (slug or src_…) · "releases get <source>" for source details`;
      console.log(chalk.dim(`\n${hint}`));
    });
}
