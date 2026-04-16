import { Command } from "commander";
import chalk from "chalk";
import { unifiedSearch } from "../../api/client.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { logger } from "@releases/lib/logger";
import type { UnifiedSearchResponse } from "../../api/types.js";

const SEARCH_MODES = ["lexical", "semantic", "hybrid"] as const;
type SearchMode = (typeof SEARCH_MODES)[number];

function parseMode(raw: string | undefined): SearchMode | undefined {
  if (raw === undefined) return undefined;
  if ((SEARCH_MODES as readonly string[]).includes(raw)) return raw as SearchMode;
  throw new Error(`Invalid --mode value: "${raw}". Expected one of: ${SEARCH_MODES.join(", ")}.`);
}

export function registerSearchCommand(program: Command) {
  program
    .command("search")
    .description("Search across organizations, products, and releases")
    .argument("<query>", "Search query")
    .option("-l, --limit <n>", "Max results per type", "10")
    .option("--type <type>", "Limit to a result type: orgs, products, releases")
    .option("--mode <mode>", `Search mode: ${SEARCH_MODES.join(" | ")}`)
    .option("--json", "Output as JSON")
    .action(async (query: string, opts: { limit: string; type?: string; mode?: string; json?: boolean }) => {
      const limit = parseInt(opts.limit, 10);

      let mode: SearchMode | undefined;
      try {
        mode = parseMode(opts.mode);
      } catch (err) {
        logger.error(err instanceof Error ? err.message : String(err));
        process.exit(1);
      }

      const response = await unifiedSearch(
        query,
        limit,
        mode ? { mode } : undefined,
      );

      const types = opts.type
        ? [opts.type as keyof Omit<UnifiedSearchResponse, "query">]
        : (["orgs", "products", "releases"] as const);

      if (opts.json) {
        const filtered: Record<string, unknown> = { query: response.query };
        for (const t of types) filtered[t] = response[t];
        if (response.mode !== undefined) filtered.mode = response.mode;
        if (response.degraded !== undefined) filtered.degraded = response.degraded;
        if (response.degradedReason !== undefined) filtered.degradedReason = response.degradedReason;
        console.log(JSON.stringify(filtered, null, 2));
        return;
      }

      if (response.degraded) {
        logger.warn(`Search degraded to lexical${response.degradedReason ? `: ${response.degradedReason}` : ""}.`);
      }

      let totalResults = 0;

      if (types.includes("orgs") && response.orgs.length > 0) {
        console.log(chalk.bold.underline("Organizations"));
        for (const org of response.orgs) {
          const meta = [org.category, org.domain].filter(Boolean).join(" | ");
          console.log(`  ${chalk.cyan.bold(stripAnsi(org.name))} ${chalk.dim(`(${org.slug})`)}`);
          if (meta) console.log(`  ${chalk.dim(meta)}`);
        }
        console.log();
        totalResults += response.orgs.length;
      }

      if (types.includes("products") && response.products.length > 0) {
        console.log(chalk.bold.underline("Products"));
        for (const p of response.products) {
          const org = p.orgName ? ` ${chalk.dim(`by ${stripAnsi(p.orgName)}`)}` : "";
          console.log(`  ${chalk.cyan.bold(stripAnsi(p.name))} ${chalk.dim(`(${p.slug})`)}${org}`);
        }
        console.log();
        totalResults += response.products.length;
      }

      if (types.includes("releases") && response.releases.length > 0) {
        console.log(chalk.bold.underline("Releases"));
        for (const r of response.releases) {
          const idLabel = r.id ? ` ${chalk.dim(r.id.slice(0, 12))}` : "";
          console.log(`  ${chalk.cyan.bold(stripAnsi(r.title))}${idLabel}`);
          console.log(chalk.dim(`  Source: ${stripAnsi(r.sourceName)} (${r.sourceSlug})  |  Published: ${r.publishedAt ?? "No date"}`));
          const summary = stripAnsi(r.summary);
          console.log(`  ${summary}${summary.length >= 150 ? "..." : ""}`);
          console.log();
        }
        totalResults += response.releases.length;
      }

      if (totalResults === 0) console.log(chalk.yellow("No results found."));
      else console.log(chalk.dim(`${totalResults} result(s) found.`));
    });
}
