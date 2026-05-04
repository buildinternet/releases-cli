import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { listSourcesWithOrg, findSource } from "../../api/client.js";
import { sourceNotFound } from "../suggest.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { writeJson } from "../../lib/output.js";
import { logger } from "@releases/lib/logger";
import {
  DEFAULT_PAGE_SIZE,
  parseMetadataObject,
  formatTruncationWarning,
  type ListResponse,
} from "@buildinternet/releases-core/cli-contracts";

function getFetchMethod(type: string, meta: Record<string, unknown> | null): string {
  if (type === "github") return "github";
  if (type === "feed") return "feed";
  if (meta?.feedUrl) return "feed";
  if (meta?.noFeedFound) return "ai";
  return "-";
}

function paginateExample(json: boolean): string {
  return `releases list${json ? " --json" : ""} --limit <n> --page <p>`;
}

export function registerListCommand(program: Command) {
  program
    .command("list")
    .description("List all configured changelog sources, or show details for a single source")
    .argument("[slug]", "Show details for a specific source by slug")
    .option("--json", "Output as JSON")
    .option("--org <org>", "Filter by organization slug")
    .option("--product <product>", "Filter by product slug")
    .option("--has-feed", "Only show sources that have a discovered feed URL")
    .option("--query <text>", "Filter by name, slug, or URL")
    .option("--category <category>", "Filter by organization or product category")
    .option("--include-disabled", "Include disabled sources in the list")
    .option("--compact", "Return lightweight fields only")
    .option("--limit <n>", `Limit the number of results (default ${DEFAULT_PAGE_SIZE})`)
    .option("--page <n>", "Page number for paginated results")
    .option("--flat", "Legacy: return a bare array instead of the paginated envelope (--json only)")
    .action(
      async (
        slug: string | undefined,
        opts: {
          json?: boolean;
          org?: string;
          product?: string;
          category?: string;
          hasFeed?: boolean;
          query?: string;
          includeDisabled?: boolean;
          compact?: boolean;
          limit?: string;
          page?: string;
          flat?: boolean;
        },
      ) => {
        // Validate pagination flags before the slug fast path so malformed
        // --limit / --page still error consistently, even when ignored by the
        // single-source branch.
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

        if (slug) {
          const source = await findSource(slug);
          if (!source) return sourceNotFound(slug);
          const parsedMeta = parseMetadataObject(source.metadata);
          const method = getFetchMethod(source.type, parsedMeta);
          if (opts.json) {
            const parsed: Record<string, unknown> = {
              ...source,
              method,
              metadata: parsedMeta ?? source.metadata,
            };
            await writeJson(parsed);
            return;
          }
          const label = (key: string, val: string | null | undefined) =>
            `  ${chalk.bold(key.padEnd(16))} ${val ?? chalk.dim("—")}`;
          console.log(chalk.bold(`\n${stripAnsi(source.name)}\n`));
          console.log(label("Slug", source.slug));
          console.log(label("Type", source.type));
          console.log(label("Method", method === "-" ? null : method));
          console.log(label("URL", source.url));
          console.log(label("Org", source.orgId ?? null));
          console.log(label("Last Fetched", source.lastFetchedAt));
          console.log(label("Primary", source.isPrimary ? "yes" : null));
          console.log(label("Status", source.isHidden ? "disabled" : "active"));
          console.log(label("Fetch Priority", source.fetchPriority));
          console.log("");
          return;
        }

        const { items: pageItems, pagination: apiPagination } = await listSourcesWithOrg({
          orgSlug: opts.org,
          productSlug: opts.product,
          category: opts.category,
          hasFeed: opts.hasFeed,
          query: opts.query,
          includeHidden: opts.includeDisabled,
          limit: pageSize,
          page,
          envelope: true,
        });

        if (pageItems.length === 0 && page === 1 && !opts.json) {
          console.log("No sources configured.");
          return;
        }

        if (opts.json) {
          const items: Record<string, unknown>[] = pageItems.map((row) => {
            const parsedMeta = parseMetadataObject(row.metadata);
            const method = getFetchMethod(row.type, parsedMeta);
            if (opts.compact) {
              return {
                id: row.id,
                slug: row.slug,
                name: row.name,
                type: row.type,
                method,
                orgName: row.orgName ?? null,
                productName: row.productName ?? null,
                releaseCount: row.releaseCount,
                latestDate: row.latestDate ?? null,
                lastFetchedAt: row.lastFetchedAt ?? null,
              };
            }
            return {
              ...row,
              method,
              metadata: parsedMeta ?? row.metadata,
            };
          });

          const warnTruncated = !explicitLimit && apiPagination.hasMore;

          if (opts.flat) {
            await writeJson(items);
          } else {
            const response: ListResponse<Record<string, unknown>> = {
              items,
              pagination: apiPagination,
            };
            await writeJson(response);
          }

          if (warnTruncated) {
            logger.warn(
              formatTruncationWarning({
                returned: items.length,
                pageSize,
                commandExample: paginateExample(true),
              }),
            );
          }
          return;
        }

        const table = new Table({
          head: ["Name", "Slug", "Type", "Method", "URL", "Org", "Product", "Last Fetched"],
        });

        for (const row of pageItems) {
          const method = getFetchMethod(row.type, parseMetadataObject(row.metadata));
          const name = stripAnsi(row.name);
          table.push([
            row.isPrimary ? `${name} ${chalk.yellow("\u2605")}` : name,
            row.slug,
            row.type,
            method,
            row.url,
            row.orgName ? stripAnsi(row.orgName) : chalk.dim("\u2014"),
            row.productName ?? chalk.dim("\u2014"),
            row.lastFetchedAt ?? chalk.dim("never"),
          ]);
        }

        console.log(table.toString());
        if (!explicitLimit && apiPagination.hasMore) {
          logger.warn(
            formatTruncationWarning({
              returned: pageItems.length,
              pageSize,
              commandExample: paginateExample(false),
            }),
          );
        }
      },
    );
}
