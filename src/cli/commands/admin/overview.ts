/**
 * Overview admin commands. Canonical surface mirrors the verb-rename pattern
 * (PR #113) — `overview list/get/update/inputs/plan` are subcommands under
 * `admin overview`. The legacy kebab-case names (`overview-list`,
 * `overview-write`, `overview-inputs`, and the bare `overview <slug>` read
 * form) are wired as deprecated aliases that warn-and-delegate.
 */
import type { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  findOrg,
  listOrgs,
  getOverview,
  getOverviewInputs,
  getOverviewInputsCheck,
  getOverviewManifest,
  upsertOverview,
  type OverviewManifestRow,
} from "../../../api/client.js";
import { orgNotFound } from "../../suggest.js";
import { writeJson } from "../../../lib/output.js";
import { parsePositiveIntFlag } from "../../../lib/flags.js";
import { logger } from "@releases/lib/logger";
import { timeAgo } from "@buildinternet/releases-core/dates";
import {
  filterStaleOrgs,
  STALE_MIN_RELEASES_DEFAULT,
  STALE_GRACE_DAYS_DEFAULT,
  type OrgWithOverview,
} from "../../../lib/overview-stale-filter.js";
import type { OrgListItem } from "@buildinternet/releases-api-types";
import { computePagination } from "@buildinternet/releases-core/cli-contracts";
import { unescapeHtmlEntities } from "./overview/unescape-html.js";
import { readContentArg } from "../../../lib/input.js";
import { warnDeprecatedAlias } from "../../../lib/deprecated-alias.js";

// ── Types ─────────────────────────────────────────────────────────────────────

interface OverviewListOpts {
  json?: boolean;
  query?: string;
  // Server-side manifest filters (preferred — single round trip)
  staleDays?: string;
  missing?: boolean;
  hasActivity?: boolean;
  // Legacy client-side staleness filter (kept for back-compat)
  stale?: boolean;
  staleMinReleases?: string;
  staleGraceDays?: string;
}

interface OverviewGetOpts {
  json?: boolean;
}

interface OverviewUpdateOpts {
  contentFile: string;
  releaseCount?: string;
  lastContributingAt?: string;
  unescapeHtml?: boolean;
  json?: boolean;
}

interface OverviewInputsOpts {
  json?: boolean;
  window?: string;
  limit?: string;
  check?: boolean;
}

interface OverviewPlanOpts {
  json?: boolean;
  staleDays?: string;
  missing?: boolean;
  hasActivity?: boolean;
}

// ── Action handlers ───────────────────────────────────────────────────────────

async function overviewGetAction(orgIdentifier: string, opts: OverviewGetOpts): Promise<void> {
  const org = await findOrg(orgIdentifier);
  if (!org) return orgNotFound(orgIdentifier);

  const overview = await getOverview("org", org.slug);
  if (!overview) {
    if (opts.json) {
      await writeJson({ org: org.slug, overview: null });
    } else {
      console.log(chalk.yellow(`No overview available for ${org.name}.`));
    }
    return;
  }

  if (opts.json) {
    await writeJson({
      org: org.slug,
      content: overview.content,
      releaseCount: overview.releaseCount,
      generatedAt: overview.generatedAt,
      updatedAt: overview.updatedAt,
      lastContributingReleaseAt: overview.lastContributingReleaseAt,
    });
    return;
  }

  const ageLabel = overview.generatedAt ? (timeAgo(overview.generatedAt) ?? "?") : "?";
  console.log(chalk.bold(`${org.name} — overview`));
  console.log(
    chalk.dim(`  generated ${ageLabel} · ${overview.releaseCount} releases contributing`),
  );
  console.log();
  console.log(overview.content);
}

async function overviewUpdateAction(
  orgIdentifier: string,
  opts: OverviewUpdateOpts,
): Promise<void> {
  const org = await findOrg(orgIdentifier);
  if (!org) return orgNotFound(orgIdentifier);

  let content = await readContentArg(opts.contentFile);
  if (opts.unescapeHtml) content = unescapeHtmlEntities(content);
  if (!content.trim()) {
    logger.error("Content is empty — refusing to write.");
    process.exit(2);
  }

  let releaseCount = parsePositiveIntFlag("release-count", opts.releaseCount);
  let lastContributingAt = opts.lastContributingAt;

  if (releaseCount === undefined || lastContributingAt === undefined) {
    const inputs = await getOverviewInputs(org.slug);
    releaseCount ??= inputs.totalAvailable;
    lastContributingAt ??= inputs.selected[0]?.publishedAt ?? undefined;
  }

  await upsertOverview(org.slug, {
    content,
    releaseCount,
    lastContributingReleaseAt: lastContributingAt ?? null,
  });

  if (opts.json) {
    await writeJson({
      org: org.slug,
      chars: content.length,
      releaseCount,
      lastContributingReleaseAt: lastContributingAt ?? null,
    });
  } else {
    logger.info(
      `Overview written for ${org.name}: ${content.length} chars, ${releaseCount} releases.`,
    );
  }
}

async function overviewInputsAction(
  orgIdentifier: string,
  opts: OverviewInputsOpts,
): Promise<void> {
  const org = await findOrg(orgIdentifier);
  if (!org) return orgNotFound(orgIdentifier);

  const window = parsePositiveIntFlag("window", opts.window);
  const limit = parsePositiveIntFlag("limit", opts.limit);

  if (opts.check) {
    const result = await getOverviewInputsCheck(org.slug, { window, limit });
    if (opts.json) {
      await writeJson(result);
      return;
    }
    console.log(chalk.bold(`${org.name} — overview inputs (check)`));
    console.log(
      chalk.dim(
        `  selected ${result.selected} of ${result.totalAvailable} · window ${result.windowDays}d · existing: ${result.hasExistingContent ? "yes" : "no"}`,
      ),
    );
    console.log(
      result.wouldRegenerate
        ? chalk.green("  wouldRegenerate: true")
        : chalk.yellow("  wouldRegenerate: false"),
    );
    return;
  }

  const inputs = await getOverviewInputs(org.slug, { window, limit });

  if (opts.json) {
    await writeJson(inputs);
    return;
  }

  console.log(chalk.bold(`${inputs.org.name} — overview inputs`));
  console.log(
    chalk.dim(
      `  window: ${inputs.windowDays}d · sources: ${inputs.sources.length} · selected: ${inputs.selected.length} of ${inputs.totalAvailable}`,
    ),
  );
  console.log();
  if (inputs.existingContent) {
    console.log(chalk.dim("Existing overview present (will be passed for amend-and-evolve)."));
  } else {
    console.log(chalk.dim("No existing overview — first generation."));
  }
  if (inputs.selected.length === 0) {
    console.log();
    console.log(chalk.yellow("No releases in window. Skip generation; nothing to write."));
    return;
  }
  console.log();
  console.log(chalk.dim("Selected releases (most recent first):"));
  for (const r of inputs.selected.slice(0, 10)) {
    const v = r.version ? ` ${r.version}` : "";
    const t = r.title ? ` — ${r.title}` : "";
    console.log(`  ${r.publishedAt ?? "—"}${v}${t}`);
  }
  if (inputs.selected.length > 10) {
    console.log(chalk.dim(`  … ${inputs.selected.length - 10} more (use --json for full list)`));
  }
}

/**
 * Server-side manifest path. Used when any of `staleDays/missing/hasActivity`
 * is set, or for `overview plan` mode (which always sets `format=plan`).
 */
async function fetchManifest(opts: {
  staleDays?: number;
  missing?: boolean;
  hasActivity?: boolean;
  plan?: boolean;
}): Promise<OverviewManifestRow[]> {
  // Manifest is small (one row per org). Pull every page so consumers don't
  // have to. The pagination envelope is the standard `{items, pagination}`.
  const all: OverviewManifestRow[] = [];
  let page = 1;
  let hasMore = true;
  while (hasMore) {
    // eslint-disable-next-line no-await-in-loop
    const res = await getOverviewManifest({ ...opts, page, limit: 200 });
    all.push(...res.items);
    hasMore = res.pagination.hasMore;
    page += 1;
  }
  return all;
}

function renderManifestTable(rows: OverviewManifestRow[], plan: boolean): void {
  const table = new Table({
    head: [
      chalk.cyan("Org"),
      chalk.cyan("Staleness"),
      chalk.cyan("Recent"),
      chalk.cyan("Behind"),
      chalk.cyan("Last Activity"),
      chalk.cyan("Overview Updated"),
      ...(plan ? [chalk.cyan("Action"), chalk.cyan("Fetch?")] : []),
    ],
  });

  for (const r of rows) {
    let stalenessLabel: string;
    switch (r.staleness) {
      case "missing":
        stalenessLabel = chalk.yellow("missing");
        break;
      case "behind":
        stalenessLabel = chalk.red("behind");
        break;
      default:
        stalenessLabel = chalk.green("fresh");
    }
    const lastAct = r.orgLastActivity
      ? (timeAgo(r.orgLastActivity) ?? r.orgLastActivity)
      : chalk.dim("—");
    const ovUpdated = r.overviewUpdatedAt
      ? (timeAgo(r.overviewUpdatedAt) ?? r.overviewUpdatedAt)
      : chalk.dim("—");
    const row = [
      r.orgSlug,
      stalenessLabel,
      String(r.recentReleaseCount),
      String(r.releasesSinceOverview),
      lastAct,
      ovUpdated,
    ];
    if (plan) {
      const action = r.action ?? "";
      row.push(action, r.needsFetch ? chalk.yellow("yes") : chalk.dim("no"));
    }
    table.push(row);
  }

  console.log(table.toString());
}

async function overviewListAction(opts: OverviewListOpts): Promise<void> {
  const useManifest =
    opts.staleDays !== undefined || opts.missing === true || opts.hasActivity === true;

  if (useManifest) {
    const staleDays = parsePositiveIntFlag("stale-days", opts.staleDays);
    const rows = await fetchManifest({
      staleDays,
      missing: opts.missing,
      hasActivity: opts.hasActivity,
    });

    // Optional client-side query filter (api manifest doesn't take ?query yet).
    const filtered = opts.query
      ? rows.filter((r) => {
          const q = opts.query!.toLowerCase();
          return r.orgSlug.toLowerCase().includes(q) || r.orgName.toLowerCase().includes(q);
        })
      : rows;

    if (opts.json) {
      await writeJson({
        items: filtered,
        pagination: computePagination({
          page: 1,
          pageSize: filtered.length,
          returned: filtered.length,
          totalItems: filtered.length,
        }),
      });
      return;
    }
    if (filtered.length === 0) {
      console.log(chalk.green("No matching overviews."));
      return;
    }
    renderManifestTable(filtered, false);
    console.log(chalk.dim(`\n${filtered.length} org(s)`));
    return;
  }

  // Legacy client-side path — kept for the back-compat `--stale` flag and the
  // bare `overview list` invocation. Pulls every page through the org list,
  // attaches each overview, applies the legacy staleness predicate.
  const minReleases = parsePositiveIntFlag("stale-min-releases", opts.staleMinReleases);
  const graceDays = parsePositiveIntFlag("stale-grace-days", opts.staleGraceDays);

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
    if (opts.json)
      await writeJson({
        items: [],
        pagination: computePagination({ page: 1, pageSize: 0, returned: 0, totalItems: 0 }),
      });
    else console.log(chalk.yellow("No organizations found."));
    return;
  }

  let candidates: OrgWithOverview[];

  if (opts.stale) {
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
    if (opts.json)
      await writeJson({
        items: [],
        pagination: computePagination({ page: 1, pageSize: 0, returned: 0, totalItems: 0 }),
      });
    else console.log(chalk.green("No stale overviews found."));
    return;
  }

  if (opts.json) {
    const items = candidates.map((o) => ({
      slug: o.slug,
      name: o.name,
      recentReleaseCount: o.recentReleaseCount,
      lastActivity: o.lastActivity,
      overviewUpdatedAt: o.overview?.updatedAt ?? null,
      overviewMissing: !o.overview,
    }));
    await writeJson({
      items,
      pagination: computePagination({
        page: 1,
        pageSize: items.length,
        returned: items.length,
        totalItems: items.length,
      }),
    });
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
    const lastAct = o.lastActivity ? (timeAgo(o.lastActivity) ?? o.lastActivity) : chalk.dim("—");
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
}

async function overviewPlanAction(opts: OverviewPlanOpts): Promise<void> {
  const staleDays = parsePositiveIntFlag("stale-days", opts.staleDays);
  const rows = await fetchManifest({
    staleDays,
    missing: opts.missing,
    hasActivity: opts.hasActivity,
    plan: true,
  });

  if (opts.json) {
    await writeJson({
      items: rows,
      pagination: computePagination({
        page: 1,
        pageSize: rows.length,
        returned: rows.length,
        totalItems: rows.length,
      }),
    });
    return;
  }

  if (rows.length === 0) {
    console.log(chalk.green("Nothing to plan — no orgs match the filter."));
    return;
  }

  renderManifestTable(rows, true);

  // Group counts by action for the orchestrator's summary.
  const byAction = rows.reduce<Record<string, number>>((acc, r) => {
    if (r.action) acc[r.action] = (acc[r.action] ?? 0) + 1;
    return acc;
  }, {});
  const parts = ["missing", "refresh", "skip"].map((a) => `${a}: ${byAction[a] ?? 0}`).join(" · ");
  console.log(chalk.dim(`\n${rows.length} org(s) — ${parts}`));
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerOverviewCommands(admin: Command): void {
  // Canonical subcommand group. Subcommands resolve normally; if the bare
  // `admin overview <slug>` form is invoked (deprecated), commander falls
  // through to the group's default action below.
  const overview = admin.command("overview").description("Manage org overviews");

  // Bare `overview <org>` is the legacy read form. Keep it working with a
  // deprecation warning that points at `overview get <org>`.
  overview
    .argument("[org]", "Organization slug or ID (deprecated; use 'overview get <org>')")
    .option("--json", "Output as JSON")
    .action((arg: string | undefined, opts: OverviewGetOpts) => {
      if (!arg) {
        overview.help();
        return;
      }
      logger.warn('"overview <org>" is deprecated, use "overview get <org>"');
      return overviewGetAction(arg, opts);
    });

  overview
    .command("get")
    .description("Read an organization's AI overview")
    .argument("<org>", "Organization slug or ID")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview get vercel
  releases admin overview get vercel --json`,
    )
    .action(overviewGetAction);

  overview
    .command("list")
    .description("List organizations with their overview status")
    .option("--query <text>", "Filter by org name, slug, or domain")
    .option("--json", "Output as JSON")
    // Server-side manifest filters (preferred) — set any one to use /v1/admin/overviews
    .option("--stale-days <n>", "Include behind rows whose overview is at least N days old")
    .option("--missing", "Include orgs with no overview at all")
    .option("--has-activity", "Drop orgs with zero recent releases")
    // Legacy client-side flags
    .option("--stale", "(legacy) client-side staleness filter — prefer --stale-days / --missing")
    .option(
      "--stale-min-releases <n>",
      `(legacy) Min recent-release count to qualify as active (default ${STALE_MIN_RELEASES_DEFAULT})`,
    )
    .option(
      "--stale-grace-days <d>",
      `(legacy) Grace period in days before activity makes overview stale (default ${STALE_GRACE_DAYS_DEFAULT})`,
    )
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview list
  releases admin overview list --stale-days 14 --missing --has-activity --json
  releases admin overview list --query vercel

The server-side manifest (--stale-days / --missing / --has-activity) is the
preferred path — one HTTP call returns the planning-ready rows. The legacy
--stale / --stale-min-releases / --stale-grace-days flags trigger a slower
client-side scan and remain for back-compat.`,
    )
    .action(overviewListAction);

  overview
    .command("plan")
    .description("Planning manifest with action and needsFetch hints (format=plan)")
    .option("--stale-days <n>", "Include behind rows whose overview is at least N days old")
    .option("--missing", "Include orgs with no overview at all")
    .option("--has-activity", "Drop orgs with zero recent releases")
    .option("--json", "Output as JSON (recommended for orchestrators)")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview plan --stale-days 14 --missing --has-activity --json
  releases admin overview plan --json

Adds per-row \`action\` (missing | refresh | skip) and \`needsFetch\` (true when
the org has active sources but the most recent release is more than 7 days
old — orchestrator should poll-and-fetch first).`,
    )
    .action(overviewPlanAction);

  overview
    .command("inputs")
    .description("Build the input payload for an overview regeneration")
    .argument("<org>", "Organization slug or ID")
    .option("--window <days>", "Lookback window in days (default 90)")
    .option("--limit <n>", "Max releases to include (default 50)")
    .option(
      "--check",
      "Pre-flight only — return {selected, totalAvailable, hasExistingContent, wouldRegenerate}",
    )
    .option("--json", "Output as JSON (recommended for agent consumption)")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview inputs vercel --json
  releases admin overview inputs vercel --check --json
  releases admin overview inputs vercel --window 30 --json

Use --check to decide whether to dispatch a regen sub-agent without paying for
the full release-content + media payload. Otherwise feed the JSON to the
generator described in the \`regenerating-overviews\` skill, then upload the
result with \`releases admin overview update\`.`,
    )
    .action(overviewInputsAction);

  overview
    .command("update")
    .description("Upload a generated overview body for an organization")
    .argument("<org>", "Organization slug or ID")
    .requiredOption("--content-file <path>", "Path to a markdown file containing the overview")
    .option(
      "--release-count <n>",
      "Number of releases the overview reflects (defaults to totalAvailable from inputs)",
    )
    .option(
      "--last-contributing-at <iso>",
      "ISO timestamp of the most recent release reflected (defaults to first selected release)",
    )
    .option("--unescape-html", "Decode &amp;, &lt;, &gt;, &quot;, &#39; before uploading")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview update vercel --content-file /tmp/vercel-overview.md
  releases admin overview update vercel --content-file - --json   (reads stdin)

Writes via POST /v1/orgs/:slug/overview. Last-write-wins on conflict.
When --release-count or --last-contributing-at are omitted, the CLI re-fetches
overview-inputs to derive them.`,
    )
    .action(overviewUpdateAction);

  // ── Deprecated kebab-case aliases ──
  // Wired directly on the parent admin command to preserve the old surface
  // (`admin overview-list`, `admin overview-write`, `admin overview-inputs`).
  // Each warns then delegates to the canonical handler.

  admin
    .command("overview-list")
    .description("(deprecated — use overview list) List organizations with their overview status")
    .option("--stale", "Only show orgs whose overviews need regeneration")
    .option("--stale-min-releases <n>", "Min recent-release count to qualify as active")
    .option("--stale-grace-days <d>", "Grace period in days before activity makes overview stale")
    .option("--query <text>", "Filter by org name, slug, or domain")
    .option("--stale-days <n>", "Include behind rows whose overview is at least N days old")
    .option("--missing", "Include orgs with no overview at all")
    .option("--has-activity", "Drop orgs with zero recent releases")
    .option("--json", "Output as JSON")
    .action(
      warnDeprecatedAlias<[OverviewListOpts]>("overview-list", "overview list", overviewListAction),
    );

  admin
    .command("overview-inputs")
    .description("(deprecated — use overview inputs) Build the input payload for a regeneration")
    .argument("<org>", "Organization slug or ID")
    .option("--window <days>", "Lookback window in days (default 90)")
    .option("--limit <n>", "Max releases to include (default 50)")
    .option("--check", "Pre-flight only")
    .option("--json", "Output as JSON")
    .action(
      warnDeprecatedAlias<[string, OverviewInputsOpts]>(
        "overview-inputs",
        "overview inputs",
        overviewInputsAction,
      ),
    );

  admin
    .command("overview-write")
    .description("(deprecated — use overview update) Upload a generated overview body")
    .argument("<org>", "Organization slug or ID")
    .requiredOption("--content-file <path>", "Path to a markdown file containing the overview")
    .option("--release-count <n>", "Number of releases the overview reflects")
    .option("--last-contributing-at <iso>", "ISO timestamp of the most recent release reflected")
    .option("--unescape-html", "Decode HTML entities before uploading")
    .option("--json", "Output as JSON")
    .action(
      warnDeprecatedAlias<[string, OverviewUpdateOpts]>(
        "overview-write",
        "overview update",
        overviewUpdateAction,
      ),
    );
}
