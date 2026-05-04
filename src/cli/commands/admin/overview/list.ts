import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import { listOrgs, getOverview } from "../../../../api/client.js";
import { writeJson } from "../../../../lib/output.js";
import { parsePositiveIntFlag } from "../../../../lib/flags.js";
import { timeAgo } from "@buildinternet/releases-core/dates";
import {
  filterStaleOrgs,
  STALE_MIN_RELEASES_DEFAULT,
  STALE_GRACE_DAYS_DEFAULT,
  type OrgWithOverview,
} from "../../../../lib/overview-stale-filter.js";
import type { OrgListItem } from "@buildinternet/releases-api-types";

interface OverviewListOpts {
  json?: boolean;
  stale?: boolean;
  staleMinReleases?: string;
  staleGraceDays?: string;
  query?: string;
}

export function registerOverviewListCommand(program: Command) {
  program
    .command("overview-list")
    .description("List organizations with their overview status")
    .option("--stale", "Only show orgs whose overviews need regeneration")
    .option(
      "--stale-min-releases <n>",
      `Min recent-release count to qualify as active (default ${STALE_MIN_RELEASES_DEFAULT})`,
    )
    .option(
      "--stale-grace-days <d>",
      `Grace period in days before new activity makes overview stale (default ${STALE_GRACE_DAYS_DEFAULT})`,
    )
    .option("--query <text>", "Filter by org name, slug, or domain")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview-list
  releases admin overview-list --stale
  releases admin overview-list --stale --stale-min-releases 3 --stale-grace-days 14
  releases admin overview-list --stale --json

Staleness check (--stale):
  An org is stale when recentReleaseCount > minReleases AND the overview is
  either missing or lastActivity > overview.updatedAt + graceDays.

  This matches the signal used by the weekly regen routine to identify orgs
  that need a fresh overview.`,
    )
    .action(async (opts: OverviewListOpts) => {
      const minReleases = parsePositiveIntFlag("stale-min-releases", opts.staleMinReleases);
      const graceDays = parsePositiveIntFlag("stale-grace-days", opts.staleGraceDays);

      // listOrgs returns OrgListItem[] at runtime (includes recentReleaseCount + lastActivity)
      // but the API types model the row as Organization. Cast through unknown
      // here until upstream type is updated. Pull every page so the
      // overview-stale scan doesn't miss orgs past the default page.
      const orgs: OrgListItem[] = [];
      let page = 1;
      let hasMore = true;
      while (hasMore) {
        // eslint-disable-next-line no-await-in-loop
        const result = await listOrgs({ query: opts.query, page, limit: 200 });
        orgs.push(...(result.items as unknown as OrgListItem[]));
        hasMore = result.pagination.hasMore;
        page += 1;
      }

      if (orgs.length === 0) {
        if (opts.json) await writeJson([]);
        else console.log(chalk.yellow("No organizations found."));
        return;
      }

      let candidates: OrgWithOverview[];

      if (opts.stale) {
        // Fetch overviews for orgs that pass the count threshold before filtering
        const threshold = minReleases ?? STALE_MIN_RELEASES_DEFAULT;
        const active = orgs.filter((o) => o.recentReleaseCount > threshold);

        const withOverviews: OrgWithOverview[] = await Promise.all(
          active.map(async (o) => {
            const ov = await getOverview("org", o.slug).catch(() => null);
            const entry = o as OrgWithOverview;
            entry.overview = ov ?? undefined;
            return entry;
          }),
        );

        candidates = filterStaleOrgs(withOverviews, { minReleases, graceDays });
      } else {
        candidates = orgs as OrgWithOverview[];
      }

      if (candidates.length === 0) {
        if (opts.json) await writeJson([]);
        else console.log(chalk.green("No stale overviews found."));
        return;
      }

      if (opts.json) {
        const out = candidates.map((o) => ({
          slug: o.slug,
          name: o.name,
          recentReleaseCount: o.recentReleaseCount,
          lastActivity: o.lastActivity,
          overviewUpdatedAt: o.overview?.updatedAt ?? null,
          overviewMissing: !o.overview,
        }));
        await writeJson(out);
        return;
      }

      const table = new Table({
        head: [
          chalk.cyan("Org"),
          chalk.cyan("Recent"),
          chalk.cyan("Last Activity"),
          chalk.cyan("Overview Updated"),
        ],
      });

      for (const o of candidates) {
        const lastAct = o.lastActivity
          ? (timeAgo(o.lastActivity) ?? o.lastActivity)
          : chalk.dim("—");
        const ovUpdated = o.overview?.updatedAt
          ? (timeAgo(o.overview.updatedAt) ?? o.overview.updatedAt)
          : chalk.yellow("missing");

        table.push([o.slug, String(o.recentReleaseCount), lastAct, ovUpdated]);
      }

      console.log(table.toString());
      if (opts.stale) {
        console.log(
          chalk.dim(
            `\n${candidates.length} org(s) with stale overviews (minReleases=${minReleases ?? STALE_MIN_RELEASES_DEFAULT}, graceDays=${graceDays ?? STALE_GRACE_DAYS_DEFAULT})`,
          ),
        );
      }
    });
}
