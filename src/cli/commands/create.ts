import { Command } from "commander";
import chalk from "chalk";
import {
  findOrg,
  createOrg,
  createSource,
  findSourcesByUrls,
  isUrlExcluded,
  findProduct,
} from "../../api/client.js";
import { toSlug } from "@buildinternet/releases-core/slug";
import { logger } from "@releases/lib/logger";
import { writeJson } from "../../lib/output.js";
import { readContentArg } from "../../lib/input.js";

const VALID_TYPES = ["github", "scrape", "feed", "agent"] as const;
type SourceType = (typeof VALID_TYPES)[number];

function isValidType(t: string): t is SourceType {
  return (VALID_TYPES as readonly string[]).includes(t);
}

export function isGitHubUrl(url: string): boolean {
  return /^https?:\/\/(www\.)?github\.com\/[^/]+\/[^/]+/.test(url);
}

interface CreateSourceInput {
  name: string;
  url: string;
  type?: string;
  slug?: string;
  org?: string;
  product?: string;
  feedUrl?: string;
  batch?: boolean;
  strict?: boolean;
  dryRun?: boolean;
}

interface CreateSourceResult {
  name: string;
  slug: string;
  type: string;
  url: string;
  org?: string;
  status: "added" | "error" | "ignored" | "would-add";
  existed?: boolean;
  error?: string;
  reason?: string;
}

async function createSingleSource(input: CreateSourceInput): Promise<CreateSourceResult> {
  const { name, url } = input;

  if (input.type && !isValidType(input.type)) {
    return {
      name,
      slug: input.slug ?? toSlug(name),
      type: input.type,
      url,
      status: "error",
      error: `Invalid type "${input.type}". Must be one of: ${VALID_TYPES.join(", ")}`,
    };
  }

  const slug = input.slug ?? toSlug(name);

  // Resolve source type early so the dedup pre-check can run before any
  // org/product side effects. Type detection is pure (only depends on input).
  let sourceType: SourceType;
  const metadata: Record<string, unknown> = {};

  if (input.feedUrl) {
    sourceType = (input.type as SourceType) ?? "feed";
    metadata.feedUrl = input.feedUrl;
    metadata.feedType = "unknown";
    metadata.feedDiscoveredAt = new Date().toISOString();
    metadata.noFeedFound = false;
    logger.info(`Using provided feed URL — ${sourceType} adapter`);
  } else if (input.type) {
    sourceType = input.type as SourceType;
  } else {
    sourceType = isGitHubUrl(url) ? "github" : "scrape";
    if (sourceType === "github") {
      logger.info("Detected GitHub URL — using github adapter");
    }
  }

  // Pre-check for duplicate URL BEFORE any side-effecting calls (createOrg,
  // findProduct). The API does not reject duplicate source URLs — it
  // auto-suffixes the slug and creates a new row. Running this first also
  // prevents a wasted createOrg() if the caller's --org doesn't exist yet but
  // the source already does.
  const existingByUrl = await findSourcesByUrls([url]);
  if (existingByUrl.length > 0) {
    if (input.strict) {
      return {
        name,
        slug,
        type: sourceType,
        url,
        status: "error",
        error: `Source URL already exists: ${url}`,
      };
    }
    const src = existingByUrl[0];
    // Report the org actually attached to the existing record, not the one the
    // caller passed in — passing --org=wrong-org should not relabel a source
    // that already belongs to right-org in the response payload.
    const existingOrg = src.orgId ? await findOrg(src.orgId) : null;
    logger.info(`Source already exists: ${src.name} (${src.slug}) — returning existing`);
    return {
      name: src.name,
      slug: src.slug,
      type: src.type,
      url: src.url,
      org: existingOrg?.name ?? undefined,
      status: "added",
      existed: true,
    };
  }

  let orgId: string | null = null;
  let orgName: string | null = null;

  if (input.org) {
    let org = await findOrg(input.org);
    if (!org) {
      // Don't auto-create when the operator passed a typed ID — an unresolved
      // `org_…` is a typo, not a request to spin up a new org.
      if (input.org.startsWith("org_") || input.org.includes("/")) {
        throw new Error(`Organization not found: ${input.org}`);
      }
      if (input.dryRun) {
        // Skip the createOrg side-effect; just report what we'd do.
        const projectedSlug = toSlug(input.org);
        logger.info(`[dry-run] Would create organization: ${input.org} (${projectedSlug})`);
        orgName = input.org;
      } else {
        org = await createOrg(input.org, { slug: toSlug(input.org) });
        logger.info(`Created organization: ${org.name} (${org.slug})`);
        orgId = org.id;
        orgName = org.name;
      }
    } else {
      orgId = org.id;
      orgName = org.name;
    }
  }

  let productId: string | null = null;
  if (input.product) {
    const prod = await findProduct(input.product);
    if (!prod) {
      return {
        name,
        slug,
        type: sourceType,
        url,
        status: "error",
        error: `Product not found: "${input.product}"`,
      };
    }
    productId = prod.id;
    if (!orgId) orgId = prod.orgId;
  }

  if (!input.org && sourceType === "github") {
    const match = url.match(/github\.com\/([^/]+)\//);
    if (match) {
      const org = await findOrg(match[1]);
      if (org) {
        orgId = org.id;
        orgName = org.name;
        logger.info(`Auto-linked to organization "${orgName}"`);
      }
    }
  }

  const exclusion = await isUrlExcluded(url, orgId ?? undefined);
  if (exclusion.excluded) {
    const scopeLabel = exclusion.scope === "blocked" ? "blocked" : "ignored";
    logger.warn(
      `Skipping ${scopeLabel} URL: ${url}${exclusion.reason ? ` (${exclusion.reason})` : ""}`,
    );
    return {
      name,
      slug,
      type: sourceType,
      url,
      org: orgName ?? undefined,
      status: "ignored",
      reason: exclusion.reason,
    };
  }

  if (input.dryRun) {
    return {
      name,
      slug,
      type: sourceType,
      url,
      org: orgName ?? undefined,
      status: "would-add",
      existed: false,
    };
  }

  try {
    await createSource({
      name,
      slug,
      type: sourceType,
      url,
      orgId,
      productId,
      metadata: Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : undefined,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      name,
      slug,
      type: sourceType,
      url,
      org: orgName ?? undefined,
      status: "error",
      error: message,
    };
  }

  return {
    name,
    slug,
    type: sourceType,
    url,
    org: orgName ?? undefined,
    status: "added",
    existed: false,
  };
}

export type CreateSourceOpts = {
  type?: string;
  url?: string;
  slug?: string;
  org?: string;
  product?: string;
  name?: string;
  feedUrl?: string;
  batch?: string;
  json?: boolean;
  strict?: boolean;
  dryRun?: boolean;
};

/** Shared action for both the canonical `create` command and the deprecated `add` alias. */
export async function createSourceAction(
  name: string | undefined,
  opts: CreateSourceOpts,
): Promise<void> {
  if (opts.batch) {
    const raw = await readContentArg(opts.batch);

    let entries: CreateSourceInput[];
    try {
      entries = JSON.parse(raw);
    } catch {
      logger.error("Failed to parse batch JSON input");
      process.exit(1);
    }

    if (!Array.isArray(entries)) {
      logger.error("Batch input must be a JSON array");
      process.exit(1);
    }

    for (const [i, entry] of entries.entries()) {
      if (!entry.name || !entry.url) {
        logger.error(`Entry ${i} is missing required "name" or "url" field`);
        process.exit(1);
      }
    }

    const results: CreateSourceResult[] = [];
    let hasError = false;

    // Sequential to avoid racing on shared org lookup-or-create for entries
    // referencing the same org.
    for (const entry of entries) {
      // eslint-disable-next-line no-await-in-loop
      const result = await createSingleSource({
        ...entry,
        batch: true,
        strict: opts.strict,
        dryRun: opts.dryRun,
      });
      results.push(result);

      if (result.status === "error") {
        hasError = true;
        if (!opts.json) logger.error(chalk.red(`Failed to create ${result.name}: ${result.error}`));
      } else if (result.status === "ignored") {
        if (!opts.json)
          logger.info(
            chalk.yellow(
              `Skipped (ignored): ${result.name} (${result.url})${result.reason ? ` — ${result.reason}` : ""}`,
            ),
          );
      } else if (!opts.json) {
        const orgLabel = result.org ? ` [org: ${result.org}]` : "";
        if (result.status === "would-add") {
          logger.info(
            chalk.yellow(
              `[dry-run] Would create source: ${result.name} (${result.slug}) [${result.type}]${orgLabel}`,
            ),
          );
        } else if (result.existed) {
          logger.info(
            chalk.yellow(
              `Source already exists: ${result.name} (${result.slug}) [${result.type}]${orgLabel} — returning existing`,
            ),
          );
        } else {
          logger.info(
            chalk.green(
              `Source created: ${result.name} (${result.slug}) [${result.type}]${orgLabel}`,
            ),
          );
        }
      }
    }

    if (opts.json) await writeJson(results);
    if (hasError) process.exit(1);
    return;
  }

  const effectiveName = name ?? opts.name;
  if (!effectiveName) {
    logger.error(
      'missing required argument: name\n\n  releases admin source create "My Source" --url https://example.com/changelog',
    );
    process.exit(1);
  }
  if (!opts.url) {
    logger.error("missing required option: --url");
    process.exit(1);
  }

  const result = await createSingleSource({
    name: effectiveName,
    url: opts.url,
    type: opts.type,
    slug: opts.slug,
    org: opts.org,
    product: opts.product,
    feedUrl: opts.feedUrl,
    strict: opts.strict,
    dryRun: opts.dryRun,
  });

  if (result.status === "error") {
    if (opts.json) await writeJson(result);
    else logger.error(chalk.red(result.error!));
    process.exit(1);
  }

  if (result.status === "ignored") {
    if (opts.json) await writeJson(result);
    return;
  }

  if (opts.json) {
    await writeJson(result);
  } else {
    const orgLabel = result.org ? ` [org: ${result.org}]` : "";
    const typeLabel = !opts.type ? ` (auto-detected: ${result.type})` : "";
    if (result.status === "would-add") {
      logger.info(
        chalk.yellow(
          `[dry-run] Would create source: ${result.name} (${result.slug})${typeLabel}${orgLabel}`,
        ),
      );
    } else if (result.existed) {
      logger.info(
        chalk.yellow(
          `Source already exists: ${result.name} (${result.slug})${typeLabel}${orgLabel} — returning existing`,
        ),
      );
    } else {
      logger.info(
        chalk.green(`Source created: ${result.name} (${result.slug})${typeLabel}${orgLabel}`),
      );
    }
  }
}

function attachCreateOptions(cmd: Command): Command {
  return cmd
    .argument("[name]", "Display name for the source")
    .option(
      "--type <type>",
      "Source type: github, scrape, feed, or agent (auto-detected from URL if omitted)",
    )
    .option("--url <url>", "URL of the source")
    .option("--slug <slug>", "Custom slug (auto-derived from name if omitted)")
    .option("--org <org>", "Organization name or slug (creates if not found)")
    .option("--product <product>", "Product slug to assign this source to")
    .option("--name <name>", "Display name for the source (alternative to positional argument)")
    .option("--feed-url <feedUrl>", "Explicit feed URL")
    .option("--batch <file>", "JSON file with sources to add (use - for stdin)")
    .option("--json", "Output as JSON")
    .option("--strict", "Exit 1 if the source URL already exists (default: return existing)")
    .option("--dry-run", "Show what would be created without writing");
}

export function registerCreateCommand(program: Command) {
  attachCreateOptions(
    program
      .command("create")
      .description("Add a new changelog source")
      .addHelpText(
        "after",
        `
Examples:
  releases admin source create "Next.js" --url https://github.com/vercel/next.js
  releases admin source create "Astro" --url https://astro.build/blog --type scrape
  releases admin source create --batch sources.json`,
      ),
  ).action(createSourceAction);
}
