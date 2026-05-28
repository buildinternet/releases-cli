import { Command } from "commander";
import chalk from "chalk";
import {
  findOrg,
  findSource,
  getLatestReleases,
  getProductReleases,
  resolveProductFeedTarget,
} from "../../api/client.js";
import type { LatestRelease } from "../../api/types.js";
import { orgNotFound, productNotFound, sourceNotFound } from "../suggest.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { sleep } from "../../lib/sleep.js";
import { renderReleaseRows } from "../render/releases-table.js";
import { slimLatest } from "../render/release-json.js";
import { logger } from "@releases/lib/logger";
import { writeJson, writeJsonLine } from "../../lib/output.js";
import { parseTimeWindowFlag } from "../../lib/flags.js";

function renderStreamLine(row: LatestRelease): string {
  const version = row.version ? chalk.yellow(stripAnsi(row.version)) : "";
  const when = row.publishedAt ? chalk.dim(row.publishedAt) : chalk.dim("(no date)");
  const src = `${chalk.cyan(stripAnsi(row.sourceName))} ${chalk.dim(`(${row.sourceSlug})`)}`;
  const title = stripAnsi(row.title);
  const id = chalk.dim(row.id);
  return `${when}  ${src}  ${version ? version + "  " : ""}${title}  ${id}`;
}

// Cap the seen-id set so a long-running follow loop can't grow unbounded.
const SEEN_CAP = 500;

function rememberSeen(seen: Set<string>, ids: string[]): void {
  for (const id of ids) seen.add(id);
  if (seen.size <= SEEN_CAP) return;
  const drop = seen.size - SEEN_CAP;
  let i = 0;
  for (const id of seen) {
    if (i++ >= drop) break;
    seen.delete(id);
  }
}

export function registerTailCommand(program: Command) {
  program
    .command("tail")
    .alias("latest")
    .description("Show the latest releases, optionally tailing a live feed")
    .argument("[source]", "Source ID (src_…) or slug to filter by")
    .option("-c, --count <n>", "Number of releases to show", "10")
    .option(
      "--org <identifier>",
      "Filter to an organization (org_…, slug, domain, name, or handle)",
    )
    .option(
      "--product <identifier>",
      "Show one product's cross-source feed (org/slug, prod_… id, or product slug). Not combinable with [source] or --org.",
    )
    .option(
      "--include-coverage",
      "Include releases that are coverage of another (hidden by default)",
    )
    .option(
      "--since <when>",
      "Only releases published on/after this date. ISO (2026-01-01) or shorthand (90d, 4w, 6m, 2y).",
    )
    .option(
      "--until <when>",
      "Only releases published on/before this date. Same formats as --since.",
    )
    .option("-f, --follow", "Poll for new releases and stream them as they arrive")
    .option("--interval <seconds>", "Poll interval in seconds when following (min 5)", "60")
    .option("--json", "Output as JSON")
    .option("--full", "With --json, return the complete unprojected payload")
    .addHelpText(
      "after",
      `
Examples:
  releases tail                         Latest releases across all sources
  releases tail my-source               Latest releases from one source
  releases tail --org acme --count 20   Latest 20 releases from an org
  releases tail --product vercel/turborepo   One product's cross-source feed
  releases tail --since 30d             Releases from the last 30 days
  releases tail -f                      Follow new releases as they arrive (60s interval)
  releases tail -f --interval 30        Follow with a 30s poll interval
  releases tail --json                  Output as JSON
  releases latest                       Alias for the one-shot listing`,
    )
    .action(
      async (
        sourceArg: string | undefined,
        opts: {
          count: string;
          org?: string;
          product?: string;
          includeCoverage?: boolean;
          since?: string;
          until?: string;
          follow?: boolean;
          interval: string;
          json?: boolean;
          full?: boolean;
        },
      ) => {
        const count = parseInt(opts.count, 10);
        const intervalSeconds = Math.max(5, parseInt(opts.interval, 10) || 60);
        if (opts.full && !opts.json) logger.warn("--full only affects --json output; ignoring.");
        // Validate locally; the API resolves relative shorthand server-side.
        const since = parseTimeWindowFlag("since", opts.since);
        const until = parseTimeWindowFlag("until", opts.until);

        // --product switches to the product's cross-source feed
        // (GET /v1/orgs/:org/releases?product=…) — a different endpoint from the
        // global latest feed, so it can't combine with a [source] or --org filter.
        if (opts.product && (sourceArg || opts.org)) {
          logger.error("--product can't be combined with a [source] argument or --org.");
          process.exit(1);
        }

        if (sourceArg) {
          const source = await findSource(sourceArg);
          if (!source) return sourceNotFound(sourceArg);
        }

        let orgSlug: string | undefined;
        if (opts.org) {
          const org = await findOrg(opts.org);
          if (!org) return orgNotFound(opts.org);
          orgSlug = org.slug;
        }

        let productTarget: { orgRef: string; product: string } | null = null;
        if (opts.product) {
          productTarget = await resolveProductFeedTarget(opts.product);
          // org/slug coords aren't pre-validated here; a bad coord surfaces as a
          // null feed in fetchPage. prod_/bare-slug forms validate in the resolver.
          if (!productTarget) return productNotFound(opts.product);
        }

        const fetchOpts = {
          source: sourceArg,
          org: orgSlug,
          count,
          includeCoverage: opts.includeCoverage,
          since,
          until,
        };

        // One page of the active feed (global latest, or the product feed when
        // --product is set). Follow mode re-invokes this each tick.
        const fetchPage = async (): Promise<LatestRelease[]> => {
          if (!productTarget) return getLatestReleases(fetchOpts);
          const res = await getProductReleases({
            orgRef: productTarget.orgRef,
            product: productTarget.product,
            count,
            includeCoverage: opts.includeCoverage,
            since,
            until,
          });
          if (!res) return productNotFound(opts.product!);
          return res.releases;
        };

        const rows = await fetchPage();

        if (opts.json) {
          await writeJson(rows.map((row) => slimLatest(row, opts.full === true)));
        } else if (rows.length === 0) {
          console.log(chalk.yellow("No releases found."));
        } else if (opts.follow) {
          for (const row of rows.toReversed()) {
            console.log(renderStreamLine(row));
          }
        } else {
          console.log(renderReleaseRows(rows, { mode: "feed" }));
          console.log(
            chalk.dim(
              `\n  More: "releases get <rel_id>" for full content · "releases tail <source>" to filter by source (src_… or slug)`,
            ),
          );
        }

        if (!opts.follow) return;

        // Follow mode re-issues the same request each tick and de-dupes via the
        // seen-id set. The unfiltered default collapses onto the shared KV cache
        // key; a `--since`/`--until` window forks off it, but the API marks
        // windowed requests non-cacheable (BYPASS) so polling one is bounded —
        // and a relative bound (e.g. `30d`) re-anchors to "now" on each tick.
        const seen = new Set<string>();
        rememberSeen(
          seen,
          rows.map((r) => r.id),
        );
        console.error(chalk.dim(`\n  Following (every ${intervalSeconds}s). Ctrl-C to stop.`));

        // Polling loop — each tick depends on the previous sleep + fetch.
        while (true) {
          // eslint-disable-next-line no-await-in-loop
          await sleep(intervalSeconds * 1000);
          // eslint-disable-next-line no-await-in-loop
          const fresh = await fetchPage();
          const novel = fresh.filter((r) => !seen.has(r.id));
          if (novel.length === 0) continue;

          rememberSeen(
            seen,
            novel.map((r) => r.id),
          );
          const ordered = novel.toReversed();
          if (opts.json) {
            // Preserve stream ordering; writes must land in order.
            // eslint-disable-next-line no-await-in-loop
            for (const row of ordered) await writeJsonLine(slimLatest(row, opts.full === true));
          } else {
            for (const row of ordered) console.log(renderStreamLine(row));
          }
        }
      },
    );
}
