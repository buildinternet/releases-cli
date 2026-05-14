import { Command } from "commander";
import chalk from "chalk";
import {
  findSource,
  findOrg,
  findProduct,
  getRelease,
  getLatestReleases,
  getOrgCollections,
  getSourcesByOrg,
  getProductsByOrg,
  getTagsForOrg,
  getTagsForProduct,
} from "../../api/client.js";
import type { CollectionListItem } from "@buildinternet/releases-api-types";
import type { Source } from "@buildinternet/releases-core/schema";
import { stripAnsi } from "../../lib/sanitize.js";
import { logger } from "@releases/lib/logger";
import { renderLatestReleasesTable } from "../render/releases-table.js";
import { getEntityType, normalizeReleaseId, isLikelyBareId } from "@buildinternet/releases-core/id";
import { writeJson } from "../../lib/output.js";

export type GetEntityOpts = { json?: boolean };

/**
 * Default count for the "Latest releases" preview embedded in get responses.
 * Kept small so the text output stays scannable / token-efficient — callers
 * who want more should pivot to `releases list` or the per-entity feed.
 */
const PREVIEW_RELEASE_COUNT = 5;

/** Footer hint pointing at the canonical drill-in for fuller detail. */
function printFooterHint(lines: string[]): void {
  if (lines.length === 0) return;
  console.log("");
  console.log(chalk.dim("Next steps:"));
  for (const line of lines) console.log(chalk.dim(`  ${line}`));
}

async function notFound(identifier: string, kind: string, opts: GetEntityOpts): Promise<never> {
  if (opts.json) await writeJson(null);
  logger.info(`No ${kind} matching: ${identifier}`);
  process.exit(1);
}

/** Shared action for both the canonical `get` command and the deprecated `show` alias. */
export async function getEntityAction(identifier: string, opts: GetEntityOpts): Promise<void> {
  const type = getEntityType(identifier);

  if (type === "release" || (type === "unknown" && isLikelyBareId(identifier))) {
    return getRelease_(normalizeReleaseId(identifier), opts);
  }
  if (type === "source") return getSource(identifier, opts);
  if (type === "org") return getOrg(identifier, opts);
  if (type === "product") return await getProduct(identifier, opts);

  const [org, product, source] = await Promise.all([
    findOrg(identifier),
    findProduct(identifier),
    findSource(identifier),
  ]);
  if (org) return renderOrg(org, opts);
  if (product) return await renderProduct(product, opts);
  if (source) return await renderSource(source, opts);

  return notFound(identifier, "entity", opts);
}

async function getRelease_(id: string, opts: GetEntityOpts) {
  const result = await getRelease(id);
  if (!result) return notFound(id, "release", opts);
  const rel = result;
  if (opts.json) {
    await writeJson(rel);
    return;
  }
  console.log(chalk.dim("Release"));
  console.log(chalk.bold(stripAnsi(rel.title)));
  if (rel.version) console.log(`  Version:   ${stripAnsi(rel.version)}`);
  console.log(
    `  Source:    ${rel.sourceName ? stripAnsi(rel.sourceName) : chalk.dim("—")} (${rel.sourceSlug ?? chalk.dim("—")})`,
  );
  if (rel.publishedAt) console.log(`  Published: ${rel.publishedAt}`);
  if (rel.url) console.log(`  URL:       ${rel.url}`);
  if (rel.suppressed) {
    console.log(
      `  ${chalk.yellow("Suppressed")}${rel.suppressedReason ? `: ${stripAnsi(rel.suppressedReason)}` : ""}`,
    );
  }
  if (rel.summary) {
    console.log("");
    console.log(chalk.dim("Summary  · AI-generated, abbreviated"));
    console.log(stripAnsi(rel.summary));
  }

  // Progressive disclosure: the dispatcher response never includes the full
  // release body (content can run 10K+ tokens). Point callers at the verbose
  // command — phrasing differs depending on whether a summary was shown.
  printFooterHint([
    rel.summary
      ? `releases release get ${rel.id}      — full release body (content + metadata)`
      : `releases release get ${rel.id}      — full release body (no AI summary on file yet)`,
  ]);
}

async function getSource(identifier: string, opts: GetEntityOpts) {
  const source = await findSource(identifier);
  if (!source) return notFound(identifier, "source", opts);
  await renderSource(source, opts);
}

async function getOrg(identifier: string, opts: GetEntityOpts) {
  const org = await findOrg(identifier);
  if (!org) return notFound(identifier, "organization", opts);
  await renderOrg(org, opts);
}

async function getProduct(identifier: string, opts: GetEntityOpts) {
  const product = await findProduct(identifier);
  if (!product) return notFound(identifier, "product", opts);
  await renderProduct(product, opts);
}

/** Loose Source shape — `findSource` returns the full row but callers historically
 * narrowed it. Accept the full schema row so we can surface fetch state. */
type SourceRow = Source & {
  // Drizzle-derived fields that aren't in the published narrow Source export
  // but ARE on the wire (see `packages/core/src/schema.ts`).
  lastFetchedAt?: string | null;
  consecutiveErrors?: number | null;
  isHidden?: boolean | null;
  description?: string | null;
};

async function renderSource(rawSource: unknown, opts: GetEntityOpts) {
  const source = rawSource as SourceRow;
  if (opts.json) {
    await writeJson(source);
    return;
  }

  // Resolve org/product context + a small recent-releases preview in parallel.
  // Failures degrade silently so a broken sub-call doesn't blank the card.
  const [org, product, latest] = await Promise.all([
    source.orgId ? findOrg(source.orgId).catch(() => null) : Promise.resolve(null),
    source.productId ? findProduct(source.productId).catch(() => null) : Promise.resolve(null),
    getLatestReleases({ source: source.slug, count: PREVIEW_RELEASE_COUNT }).catch(() => []),
  ]);

  const statusLabel = source.isHidden
    ? chalk.red("hidden")
    : source.consecutiveErrors && source.consecutiveErrors > 0
      ? chalk.yellow(`erroring (${source.consecutiveErrors} consecutive)`)
      : chalk.green("active");

  console.log(chalk.dim("Source"));
  console.log(chalk.bold(source.name));
  console.log(`  Slug:       ${source.slug}`);
  console.log(`  Type:       ${source.type}`);
  console.log(`  URL:        ${source.url}`);
  if (org) console.log(`  Org:        ${org.name} (${org.slug})`);
  if (product) console.log(`  Product:    ${product.name} (${product.slug})`);
  console.log(`  Status:     ${statusLabel}`);
  if (source.lastFetchedAt) console.log(`  Last fetch: ${source.lastFetchedAt}`);

  console.log("");
  if (latest.length === 0) {
    console.log(chalk.dim("No releases yet."));
  } else {
    console.log(
      chalk.dim(
        `Latest ${latest.length} release${latest.length === 1 ? "" : "s"} (most recent first):`,
      ),
    );
    console.log(renderLatestReleasesTable(latest));
  }

  printFooterHint([
    `releases list --source ${source.slug}             — full release feed`,
    `releases fetch-log ${source.slug}                  — recent fetch attempts and errors`,
    `releases release get <rel_id>                      — open one release with full content`,
  ]);
}

async function renderOrg(
  org: {
    id: string;
    name: string;
    slug: string;
    domain: string | null;
    category: string | null;
  } & {
    description?: string | null;
  },
  opts: GetEntityOpts,
) {
  // Collections degrade to empty on failure so an unrelated bug in the
  // collections endpoint doesn't break the canonical org card; the warning
  // surfaces real issues without aborting.
  const fetchCollections = async (): Promise<CollectionListItem[]> => {
    try {
      return (await getOrgCollections(org.slug)) ?? [];
    } catch (err) {
      logger.warn(`Failed to fetch collections for ${org.slug}: ${err}`);
      return [];
    }
  };
  const [releases, collections, sources, products, tags] = await Promise.all([
    getLatestReleases({ org: org.slug, count: PREVIEW_RELEASE_COUNT }),
    fetchCollections(),
    getSourcesByOrg(org.id).catch(() => []),
    getProductsByOrg(org.id).catch(() => []),
    getTagsForOrg(org.id).catch(() => []),
  ]);

  if (opts.json) {
    await writeJson({ ...org, releases, collections, sources, products, tags });
    return;
  }

  const activeSources = sources.filter((s) => !s.isHidden && !s.consecutiveErrors).length;
  const erroringSources = sources.filter(
    (s) => !s.isHidden && s.consecutiveErrors && s.consecutiveErrors > 0,
  ).length;
  const hiddenSources = sources.filter((s) => s.isHidden).length;

  console.log(chalk.dim("Organization"));
  console.log(chalk.bold(org.name));
  console.log(`  Slug:        ${org.slug}`);
  if (org.domain) console.log(`  Domain:      ${org.domain}`);
  if (org.category) console.log(`  Category:    ${org.category}`);
  if (org.description) console.log(`  About:       ${stripAnsi(org.description)}`);
  if (tags.length > 0) console.log(`  Tags:        ${tags.join(", ")}`);
  if (sources.length > 0) {
    const breakdown: string[] = [];
    if (activeSources) breakdown.push(`${activeSources} active`);
    if (erroringSources) breakdown.push(chalk.yellow(`${erroringSources} erroring`));
    if (hiddenSources) breakdown.push(chalk.dim(`${hiddenSources} hidden`));
    const suffix = breakdown.length > 0 ? ` — ${breakdown.join(", ")}` : "";
    console.log(`  Sources:     ${sources.length}${suffix}`);
  }
  if (products.length > 0) {
    const names = products
      .slice(0, 5)
      .map((p) => `${p.name} ${chalk.dim(`(${p.slug})`)}`)
      .join(", ");
    const more = products.length > 5 ? chalk.dim(` +${products.length - 5} more`) : "";
    console.log(`  Products:    ${products.length} — ${names}${more}`);
  }
  if (collections.length > 0) {
    const labels = collections.map((c) => `${c.name} ${chalk.dim(`(${c.slug})`)}`).join(", ");
    console.log(`  Collections: ${labels}`);
  }

  console.log("");
  if (releases.length === 0) {
    console.log(chalk.dim("No releases yet."));
  } else {
    console.log(
      chalk.dim(
        `Latest ${releases.length} release${releases.length === 1 ? "" : "s"} (most recent first):`,
      ),
    );
    console.log(renderLatestReleasesTable(releases));
  }

  printFooterHint([
    `releases org get ${org.slug}                  — accounts, aliases, overview, full source list`,
    `releases org overview ${org.slug}             — AI-generated rollup`,
    `releases list --org ${org.slug}               — full release feed`,
  ]);
}

async function renderProduct(
  product: {
    id: string;
    name: string;
    slug: string;
    orgId: string;
    url: string | null;
    category: string | null;
  } & { description?: string | null },
  opts: GetEntityOpts,
) {
  // Pull related context concurrently. Each individually-degradable so a
  // single endpoint failure can't blank the product card.
  const [org, orgProducts, orgSources, tags] = await Promise.all([
    findOrg(product.orgId).catch(() => null),
    getProductsByOrg(product.orgId).catch(() => []),
    getSourcesByOrg(product.orgId).catch<Source[]>(() => []),
    getTagsForProduct(product.id).catch(() => []),
  ]);

  // /v1/sources?orgId=… returns the SourceWithOrg projection, which carries
  // productSlug/productName but not productId — match on slug to keep this
  // working without an extra round-trip per source.
  const productSources = orgSources.filter(
    (s) => (s as unknown as { productSlug?: string | null }).productSlug === product.slug,
  );
  const sourceCountRow = orgProducts.find((p) => p.id === product.id);
  const sourceCount = sourceCountRow?.sourceCount ?? productSources.length;

  if (opts.json) {
    await writeJson({
      ...product,
      orgSlug: org?.slug ?? null,
      sources: productSources,
      sourceCount,
      tags,
    });
    return;
  }

  console.log(chalk.dim("Product"));
  console.log(chalk.bold(product.name));
  console.log(`  Slug:      ${product.slug}`);
  console.log(`  Org:       ${org ? `${org.name} (${org.slug})` : product.orgId}`);
  console.log(`  URL:       ${product.url ?? chalk.dim("—")}`);
  console.log(`  Category:  ${product.category ?? chalk.dim("—")}`);
  if (product.description) console.log(`  About:     ${stripAnsi(product.description)}`);
  if (tags.length > 0) console.log(`  Tags:      ${tags.join(", ")}`);
  if (sourceCount > 0) {
    const preview = productSources
      .slice(0, 5)
      .map((s) => chalk.dim(`(${s.slug})`))
      .join(" ");
    const more = productSources.length > 5 ? chalk.dim(` +${productSources.length - 5}`) : "";
    console.log(`  Sources:   ${sourceCount} ${preview}${more}`);
  } else {
    console.log(`  Sources:   ${chalk.dim("none")}`);
  }

  // No product-scoped "latest releases" endpoint today (releases/latest takes
  // org or source, not product). Surface the workaround commands directly so
  // the user doesn't have to discover them — releases-per-org gives the
  // closest mixed feed, releases-per-source the per-source feed.
  printFooterHint(
    [
      org
        ? `releases list --org ${org.slug}              — release feed (org-scoped; mixes other products)`
        : "",
      productSources.length > 0
        ? `releases get ${productSources[0]!.slug}                    — drill into a source for its release feed`
        : "",
    ].filter(Boolean),
  );
}

export function registerGetCommand(program: Command) {
  program
    .command("get")
    .description("Get details for any entity by ID or slug")
    .argument("<identifier>", "ID (rel_/src_/org_/prod_) or slug")
    .option("--json", "Output as JSON")
    .action(getEntityAction);
}
