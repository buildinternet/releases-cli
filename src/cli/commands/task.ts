import { Command } from "commander";
import chalk from "chalk";
import * as apiClient from "../../api/client.js";
import { writeJson } from "../../lib/output.js";
import { logger } from "@releases/lib/logger";
import {
  DEFAULT_PAGE_SIZE,
  formatTruncationWarning,
} from "@buildinternet/releases-core/cli-contracts";

export function registerTaskCommand(program: Command) {
  const task = program.command("task").description("Manage remote fetch and discovery sessions");

  task
    .command("list")
    .description("List active and recent sessions")
    .option("--json", "Output as JSON")
    .option("--limit <n>", `Limit the number of results (default ${DEFAULT_PAGE_SIZE})`)
    .option("--page <n>", "Page number for paginated results")
    .action(async (opts: { json?: boolean; limit?: string; page?: string }) => {
      const parsedLimit = opts.limit === undefined ? undefined : Number(opts.limit);
      if (parsedLimit !== undefined && (!Number.isInteger(parsedLimit) || parsedLimit <= 0)) {
        logger.error("--limit must be a positive integer");
        process.exit(1);
      }
      const explicitLimit = parsedLimit !== undefined;
      const pageSize = explicitLimit ? parsedLimit : DEFAULT_PAGE_SIZE;

      const parsedPage = opts.page === undefined ? 1 : Number(opts.page);
      if (!Number.isInteger(parsedPage) || parsedPage <= 0) {
        logger.error("--page must be a positive integer");
        process.exit(1);
      }
      const page = parsedPage;

      const { items: sessions, pagination } = await apiClient.listSessions({
        limit: pageSize,
        page,
      });

      if (opts.json) {
        await writeJson({ items: sessions, pagination });
        if (!explicitLimit && pagination.hasMore) {
          logger.warn(
            formatTruncationWarning({
              returned: sessions.length,
              pageSize,
              commandExample: `releases admin discovery task list --json --limit <n> --page <p>`,
            }),
          );
        }
        return;
      }

      if (sessions.length === 0) {
        console.log(chalk.gray("No sessions found."));
        return;
      }

      for (const s of sessions) {
        const age = Math.round((Date.now() - s.startedAt) / 1000);
        const statusColor =
          s.status === "running"
            ? chalk.yellow
            : s.status === "complete"
              ? chalk.green
              : s.status === "cancelled"
                ? chalk.gray
                : chalk.red;
        const sources = s.totalSources ? `${s.sourcesFetched ?? 0}/${s.totalSources} sources` : "";
        const releases = s.releasesInserted ? `${s.releasesInserted} new` : "";
        const details = [sources, releases].filter(Boolean).join(", ");
        const detailStr = details ? chalk.gray(` (${details})`) : "";
        const ageStr =
          age < 60
            ? `${age}s`
            : age < 3600
              ? `${Math.round(age / 60)}m`
              : `${Math.round(age / 3600)}h`;

        console.log(
          `  ${statusColor(s.status.padEnd(10))} ${s.company.padEnd(30)} ${chalk.gray(s.sessionId.slice(0, 8))}  ${chalk.gray(ageStr + " ago")}${detailStr}`,
        );
      }
      if (!explicitLimit && pagination.hasMore) {
        logger.warn(
          formatTruncationWarning({
            returned: sessions.length,
            pageSize,
            commandExample: `releases admin discovery task list --limit <n> --page <p>`,
          }),
        );
      }
    });

  task
    .command("cancel")
    .description("Cancel a running session")
    .argument("<sessionId>", "Session ID (or prefix) to cancel")
    .action(async (sessionIdArg: string) => {
      let sessionId = sessionIdArg;
      if (sessionId.length < 36) {
        const { items: sessions } = await apiClient.listSessions();
        const matches = sessions.filter((s) => s.sessionId.startsWith(sessionId));
        if (matches.length === 0) {
          console.error(chalk.red(`No session found matching "${sessionId}".`));
          process.exit(1);
        }
        if (matches.length > 1) {
          console.error(chalk.red(`Multiple sessions match "${sessionId}". Be more specific.`));
          for (const m of matches) console.error(`  ${m.sessionId}  ${m.company}  ${m.status}`);
          process.exit(1);
        }
        sessionId = matches[0].sessionId;
      }

      const result = await apiClient.cancelSession(sessionId);
      if (result.ok) {
        console.log(chalk.green(`Cancel requested for session ${sessionId.slice(0, 8)}.`));
      } else {
        console.error(chalk.red(`Failed to cancel: ${result.error}`));
        process.exit(1);
      }
    });
}
