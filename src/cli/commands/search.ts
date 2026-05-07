import { Command } from "commander";
import chalk from "chalk";
import { unifiedSearch } from "../../api/client.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { logger } from "@releases/lib/logger";
import type { LookupResultPayload, UnifiedSearchResponse } from "../../api/types.js";
import { writeJson } from "../../lib/output.js";

const SEARCH_MODES = ["lexical", "semantic", "hybrid"] as const;
type SearchMode = (typeof SEARCH_MODES)[number];

function parseMode(raw: string | undefined): SearchMode | undefined {
  if (raw === undefined) return undefined;
  if ((SEARCH_MODES as readonly string[]).includes(raw)) return raw as SearchMode;
  throw new Error(`Invalid --mode value: "${raw}". Expected one of: ${SEARCH_MODES.join(", ")}.`);
}

type SearchSection = "orgs" | "catalog" | "releases";

function normalizeType(raw: string): SearchSection {
  if (raw === "products") return "catalog";
  if (raw === "orgs" || raw === "catalog" || raw === "releases") return raw;
  throw new Error(`Invalid --type value: "${raw}". Expected one of: orgs, catalog, releases.`);
}

const PREVIEW_LIMIT = 5;

function formatShortDate(iso: string | null): string {
  if (!iso) return "No date";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  } catch {
    return iso;
  }
}

function renderLookup(lookup: LookupResultPayload, query: string): void {
  console.log(chalk.bold.underline("Lookup"));

  const { status, source, releases, relatedOrg } = lookup;

  // Status label — green for found, dim for not-found variants
  const isFound = status === "indexed" || status === "existing";
  const statusLabel = isFound
    ? chalk.green.bold(status.toUpperCase())
    : chalk.dim(status.toUpperCase());

  const coordinate = source?.name ?? query;
  console.log(`  ${statusLabel}  ${chalk.cyan.bold(stripAnsi(coordinate))}`);

  // Status body
  switch (status) {
    case "indexed":
      console.log(`  Just indexed ${stripAnsi(coordinate)}. We pulled this from GitHub on demand.`);
      break;
    case "existing":
      console.log(`  Indexed ${stripAnsi(coordinate)}. (cached)`);
      break;
    case "empty":
      console.log(`  ${stripAnsi(query)}: real repo, but no tagged releases or CHANGELOG yet.`);
      break;
    case "not_found":
      console.log(
        `  ${stripAnsi(query)}: no public repo found at github.com/${stripAnsi(query)}. May be private, archived, or renamed.`,
      );
      break;
    case "deferred":
      console.log(`  ${stripAnsi(query)}: indexing in progress. Try again in a moment.`);
      break;
  }

  // Source link when available
  if (source?.slug) {
    console.log(chalk.dim(`  View source: https://releases.sh/source/${source.slug}`));
  }

  // Release preview
  if (releases && releases.length > 0) {
    console.log();
    console.log(chalk.dim("  Recent releases:"));
    const shown = releases.slice(0, PREVIEW_LIMIT);
    for (const r of shown) {
      const ver = r.version ? chalk.cyan(r.version) : chalk.dim("(no version)");
      const date = chalk.dim(formatShortDate(r.publishedAt));
      console.log(`    ${ver}   ${date}`);
    }
    const remaining = releases.length - shown.length;
    if (remaining > 0) {
      console.log(chalk.dim(`    (${remaining} more)`));
    }
  }

  // Related org rail
  if (relatedOrg) {
    console.log();
    console.log(
      `  ${chalk.dim("Did you mean:")} ${chalk.cyan.bold(stripAnsi(relatedOrg.org.name))}`,
    );
    for (const s of relatedOrg.sources) {
      const nameCol = stripAnsi(s.name).padEnd(20);
      console.log(`    ${chalk.bold(nameCol)}  ${chalk.dim(s.url)}`);
    }
  }

  console.log();
}

export function registerSearchCommand(program: Command) {
  program
    .command("search")
    .description("Search across organizations, the catalog, and releases")
    .argument("<query>", "Search query")
    .option("-l, --limit <n>", "Max results per type", "10")
    .option("--type <type>", "Limit to a result type: orgs, catalog, releases")
    .option("--mode <mode>", `Search mode: ${SEARCH_MODES.join(" | ")}`)
    .option(
      "--domain <domain>",
      "Scope to the org owning this domain (URL-shaped input is normalized)",
    )
    .option("--json", "Output as JSON")
    .action(
      async (
        query: string,
        opts: {
          limit: string;
          type?: string;
          mode?: string;
          domain?: string;
          json?: boolean;
        },
      ) => {
        const limit = parseInt(opts.limit, 10);

        let mode: SearchMode | undefined;
        try {
          mode = parseMode(opts.mode);
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }

        let types: readonly SearchSection[];
        try {
          types = opts.type
            ? [normalizeType(opts.type)]
            : (["orgs", "catalog", "releases"] as const);
        } catch (err) {
          logger.error(err instanceof Error ? err.message : String(err));
          process.exit(1);
        }

        const searchOpts: { mode?: SearchMode; domain?: string } = {};
        if (mode) searchOpts.mode = mode;
        if (opts.domain) searchOpts.domain = opts.domain;
        const response = await unifiedSearch(
          query,
          limit,
          Object.keys(searchOpts).length > 0 ? searchOpts : undefined,
        );

        if (!opts.json) {
          if (response.domainStatus === "not_found") {
            logger.warn(
              `No org owns the domain "${response.domain ?? opts.domain}". Showing no results.`,
            );
          } else if (response.domainStatus === "matched") {
            const scopedOrgName = response.orgs[0]?.name ?? response.domain;
            logger.info(`Scoped to ${scopedOrgName} (${response.domain}).`);
          }
        }

        // Read the new `catalog` field, falling back to the deprecated `products`
        // alias so older API deployments keep working. Drop the fallback once
        // the alias is removed from the wire. Bracket access avoids the
        // deprecation diagnostic on the alias read.
        const legacy = (response as unknown as Record<string, unknown>)["products"] as
          | UnifiedSearchResponse["catalog"]
          | undefined;
        const catalog: UnifiedSearchResponse["catalog"] = response.catalog ?? legacy ?? [];

        if (opts.json) {
          const filtered: Record<string, unknown> = { query: response.query };
          for (const t of types) {
            filtered[t] = t === "catalog" ? catalog : response[t];
          }
          if (response.mode !== undefined) filtered.mode = response.mode;
          if (response.degraded !== undefined) filtered.degraded = response.degraded;
          if (response.degradedReason !== undefined)
            filtered.degradedReason = response.degradedReason;
          if (response.domain !== undefined) filtered.domain = response.domain;
          if (response.domainStatus !== undefined) filtered.domainStatus = response.domainStatus;
          if (response.lookup != null) filtered.lookup = response.lookup;
          await writeJson(filtered);
          return;
        }

        if (response.degraded) {
          logger.warn(
            `Search degraded to lexical${response.degradedReason ? `: ${response.degradedReason}` : ""}.`,
          );
        }

        let totalResults = 0;

        // Lookup rail — always shown when present, regardless of --type filter.
        if (response.lookup != null) {
          renderLookup(response.lookup, query);
          totalResults += 1;
        }

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

        if (types.includes("catalog") && catalog.length > 0) {
          console.log(chalk.bold.underline("Catalog"));
          for (const p of catalog) {
            const org = p.orgName ? ` ${chalk.dim(`by ${stripAnsi(p.orgName)}`)}` : "";
            console.log(
              `  ${chalk.cyan.bold(stripAnsi(p.name))} ${chalk.dim(`(${p.slug})`)}${org}`,
            );
          }
          console.log();
          totalResults += catalog.length;
        }

        if (types.includes("releases") && response.releases.length > 0) {
          console.log(chalk.bold.underline("Releases"));
          for (const r of response.releases) {
            const idLabel = r.id ? ` ${chalk.dim(r.id)}` : "";
            console.log(`  ${chalk.cyan.bold(stripAnsi(r.title))}${idLabel}`);
            console.log(
              chalk.dim(
                `  Source: ${stripAnsi(r.sourceName)} (${r.sourceSlug})  |  Published: ${r.publishedAt ?? "No date"}`,
              ),
            );
            const summary = stripAnsi(r.summary);
            console.log(`  ${summary}${summary.length >= 150 ? "..." : ""}`);
            console.log();
          }
          totalResults += response.releases.length;
        }

        if (totalResults === 0) console.log(chalk.yellow("No results found."));
        else console.log(chalk.dim(`${totalResults} result(s) found.`));
      },
    );
}
