import { Command } from "commander";
import chalk from "chalk";
import {
  findSource,
  findOrg,
  findProduct,
  getRelease,
  getLatestReleases,
} from "../../api/client.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { renderLatestReleasesTable } from "../render/releases-table.js";
import { getEntityType, normalizeReleaseId, isLikelyBareId } from "@buildinternet/releases-core/id";
import { writeJson } from "../../lib/output.js";

export type GetEntityOpts = { json?: boolean };

/** Shared action for both the canonical `get` command and the deprecated `show` alias. */
export async function getEntityAction(identifier: string, opts: GetEntityOpts): Promise<void> {
  const type = getEntityType(identifier);

  if (type === "release" || (type === "unknown" && isLikelyBareId(identifier))) {
    return getRelease_(normalizeReleaseId(identifier), opts);
  }
  if (type === "source") return getSource(identifier, opts);
  if (type === "org") return getOrg(identifier, opts);
  if (type === "product") return await getProduct(identifier, opts);

  const org = await findOrg(identifier);
  if (org) return renderOrg(org, opts);
  const product = await findProduct(identifier);
  if (product) return await renderProduct(product, opts);
  const source = await findSource(identifier);
  if (source) return await renderSource(source, opts);

  console.error(chalk.red(`Not found: ${identifier}`));
  process.exit(1);
}

async function getRelease_(id: string, opts: GetEntityOpts) {
  const result = await getRelease(id);
  if (!result) {
    console.error(chalk.red(`Release not found: ${id}`));
    process.exit(1);
  }
  const rel = result;
  if (opts.json) {
    await writeJson(rel);
    return;
  }
  console.log(chalk.dim("Release"));
  console.log(chalk.bold(stripAnsi(rel.title)));
  console.log(`  ID:        ${rel.id}`);
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
  if (rel.contentSummary) {
    console.log("");
    console.log(chalk.dim(stripAnsi(rel.contentSummary)));
  }
}

async function getSource(identifier: string, opts: GetEntityOpts) {
  const source = await findSource(identifier);
  if (!source) {
    console.error(chalk.red(`Source not found: ${identifier}`));
    process.exit(1);
  }
  await renderSource(source, opts);
}

async function getOrg(identifier: string, opts: GetEntityOpts) {
  const org = await findOrg(identifier);
  if (!org) {
    console.error(chalk.red(`Organization not found: ${identifier}`));
    process.exit(1);
  }
  await renderOrg(org, opts);
}

async function getProduct(identifier: string, opts: GetEntityOpts) {
  const product = await findProduct(identifier);
  if (!product) {
    console.error(chalk.red(`Product not found: ${identifier}`));
    process.exit(1);
  }
  await renderProduct(product, opts);
}

async function renderSource(
  source: {
    id: string;
    name: string;
    slug: string;
    type: string;
    url: string;
    orgId: string | null;
    productId: string | null;
  },
  opts: GetEntityOpts,
) {
  if (opts.json) {
    await writeJson(source);
    return;
  }
  console.log(chalk.dim("Source"));
  console.log(chalk.bold(source.name));
  console.log(`  ID:        ${source.id}`);
  console.log(`  Slug:      ${source.slug}`);
  console.log(`  Type:      ${source.type}`);
  console.log(`  URL:       ${source.url}`);
}

async function renderOrg(
  org: { id: string; name: string; slug: string; domain: string | null; category: string | null },
  opts: GetEntityOpts,
) {
  const releases = await getLatestReleases({ orgSlug: org.slug, count: 10 });

  if (opts.json) {
    await writeJson({ ...org, releases });
    return;
  }

  console.log(chalk.dim("Organization"));
  console.log(chalk.bold(org.name));
  console.log(`  ID:      ${org.id}`);
  console.log(`  Slug:    ${org.slug}`);
  if (org.domain) console.log(`  Domain:  ${org.domain}`);
  if (org.category) console.log(`  Category: ${org.category}`);

  console.log("");
  if (releases.length === 0) {
    console.log(chalk.dim("  No releases yet."));
  } else {
    console.log(chalk.dim(`Latest ${releases.length} release${releases.length === 1 ? "" : "s"}:`));
    console.log(renderLatestReleasesTable(releases));
  }
}

async function renderProduct(
  product: {
    id: string;
    name: string;
    slug: string;
    orgId: string;
    url: string | null;
    category: string | null;
  },
  opts: GetEntityOpts,
) {
  const org = await findOrg(product.orgId);
  if (opts.json) {
    await writeJson({ ...product, orgSlug: org?.slug ?? null });
    return;
  }
  console.log(chalk.dim("Product"));
  console.log(chalk.bold(product.name));
  console.log(`  ID:        ${product.id}`);
  console.log(`  Slug:      ${product.slug}`);
  console.log(`  Org:       ${org ? `${org.name} (${org.slug})` : product.orgId}`);
  console.log(`  URL:       ${product.url ?? chalk.dim("—")}`);
  console.log(`  Category:  ${product.category ?? chalk.dim("—")}`);
}

export function registerGetCommand(program: Command) {
  program
    .command("get")
    .description("Get details for any entity by ID or slug")
    .argument("<identifier>", "ID (rel_/src_/org_/prod_) or slug")
    .option("--json", "Output as JSON")
    .action(getEntityAction);
}
