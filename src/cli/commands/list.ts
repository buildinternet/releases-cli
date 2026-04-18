import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { listSourcesWithOrg, findSource } from "../../api/client.js";
import { sourceNotFound } from "../suggest.js";
import { stripAnsi } from "../../lib/sanitize.js";
import {
  DEFAULT_PAGE_SIZE,
  computePagination,
  parseMetadataField,
  formatTruncationWarning,
  type ListResponse,
} from "@buildinternet/releases-core/cli-contracts";

function getFetchMethod(type: string, metadata: string | null): string {
  if (type === "github") return "github";
  if (type === "feed") return "feed";
  const meta = parseMetadataField(metadata);
  if (meta && typeof meta === "object") {
    const m = meta as Record<string, unknown>;
    if (m.feedUrl) return "feed";
    if (m.noFeedFound) return "ai";
  }
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
    .action(async (slug: string | undefined, opts: { json?: boolean; org?: string; product?: string; category?: string; hasFeed?: boolean; query?: string; includeDisabled?: boolean; compact?: boolean; limit?: string; page?: string; flat?: boolean }) => {
      if (slug) {
        const source = await findSource(slug);
        if (!source) return sourceNotFound(slug);
        if (opts.json) {
          const method = getFetchMethod(source.type, source.metadata ?? null);
          const parsed: Record<string, unknown> = { ...source, method, metadata: parseMetadataField(source.metadata) };
          console.log(JSON.stringify(parsed, null, 2));
          return;
        }
        const label = (key: string, val: string | null | undefined) =>
          `  ${chalk.bold(key.padEnd(16))} ${val ?? chalk.dim("—")}`;
        const method = getFetchMethod(source.type, source.metadata ?? null);
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

      const limitOpt = opts.limit ? parseInt(opts.limit, 10) : undefined;
      const explicitLimit = limitOpt != null && limitOpt > 0;
      const pageSize = explicitLimit ? limitOpt : DEFAULT_PAGE_SIZE;
      const page = opts.page ? Math.max(1, parseInt(opts.page, 10)) : 1;

      const pageItems = await listSourcesWithOrg({
        orgSlug: opts.org,
        productSlug: opts.product,
        category: opts.category,
        hasFeed: opts.hasFeed,
        query: opts.query,
        includeHidden: opts.includeDisabled,
        limit: pageSize,
        page,
      });

      // Total is only knowable when the returned count falls short of a full
      // page. Drop once the API returns pagination envelopes.
      const knownTotalOnTail = pageItems.length < pageSize
        ? (page - 1) * pageSize + pageItems.length
        : undefined;

      if (pageItems.length === 0 && page === 1 && !opts.json) {
        console.log("No sources configured.");
        return;
      }

      if (opts.json) {
        const items: Record<string, unknown>[] = pageItems.map((row) => {
          if (opts.compact) {
            return {
              id: row.id,
              slug: row.slug,
              name: row.name,
              type: row.type,
              method: getFetchMethod(row.type, row.metadata),
              orgName: row.orgName ?? null,
              productName: row.productName ?? null,
              releaseCount: row.releaseCount,
              latestDate: row.latestDate ?? null,
              lastFetchedAt: row.lastFetchedAt ?? null,
            };
          }
          return {
            ...row,
            method: getFetchMethod(row.type, row.metadata),
            metadata: parseMetadataField(row.metadata),
          };
        });

        const pagination = computePagination({
          page,
          pageSize,
          returned: items.length,
          totalItems: knownTotalOnTail,
        });

        const warnTruncated = !explicitLimit && pagination.hasMore;

        if (opts.flat) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          const response: ListResponse<Record<string, unknown>> = { items, pagination };
          console.log(JSON.stringify(response, null, 2));
        }

        if (warnTruncated) {
          console.error(formatTruncationWarning({
            returned: items.length,
            pageSize,
            commandExample: paginateExample(true),
          }));
        }
        return;
      }

      const table = new Table({
        head: ["Name", "Slug", "Type", "Method", "URL", "Org", "Product", "Last Fetched"],
      });

      for (const row of pageItems) {
        const method = getFetchMethod(row.type, row.metadata);
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
      if (!explicitLimit && pageItems.length === pageSize) {
        console.error(formatTruncationWarning({
          returned: pageItems.length,
          pageSize,
          commandExample: paginateExample(false),
        }));
      }
    });
}
