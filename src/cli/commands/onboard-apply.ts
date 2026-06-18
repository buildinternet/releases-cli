import { Command } from "commander";
import chalk from "chalk";
import { logger } from "@releases/lib/logger";
import { addIgnoredUrl, findOrg } from "../../api/orgs.js";
import { findProduct, createProduct } from "../../api/products.js";
import { createSource } from "../../api/sources.js";
import { writeJson } from "../../lib/output.js";
import type { Product } from "@buildinternet/releases-core/schema";

interface AgentDiscoveredSource {
  slug: string;
  url: string;
  type: "github" | "scrape" | "feed" | "agent";
  label: string;
  approved?: boolean;
  validationError?: string;
  contentDepth?: string;
  productName?: string;
  productSlug?: string;
}

interface DiscoveryState {
  product: string;
  sources: AgentDiscoveredSource[];
}

interface ApplyResult {
  slug: string;
  url: string;
  action: "added" | "ignored" | "skipped" | "error";
  error?: string;
}

async function applySource(
  source: AgentDiscoveredSource,
  orgId?: string,
  productId?: string,
): Promise<ApplyResult> {
  const { url, type, slug, label } = source;

  if (source.approved === false) {
    if (!orgId) return { slug, url, action: "skipped" };
    const reason = source.validationError ?? "Rejected during discovery";
    try {
      await addIgnoredUrl(url, orgId, reason);
      return { slug, url, action: "ignored" };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { slug, url, action: "error", error: `Failed to ignore: ${message}` };
    }
  }

  if (source.approved !== true) return { slug, url, action: "skipped" };

  try {
    const metadata = source.contentDepth
      ? JSON.stringify({ feedContentDepth: source.contentDepth })
      : undefined;

    await createSource({
      name: label,
      slug,
      type,
      url,
      orgId,
      productId,
      metadata,
    });

    return { slug, url, action: "added" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (
      message.includes("UNIQUE constraint") ||
      message.includes("409") ||
      message.includes("already exists")
    ) {
      return { slug, url, action: "skipped" };
    }
    return { slug, url, action: "error", error: message };
  }
}

/**
 * Lookup-or-create a product under the given org.
 * Returns the product's ID, or undefined if the org is unknown.
 */
async function resolveProduct(
  orgId: string,
  orgSlug: string,
  productSlug: string,
  productName: string,
): Promise<string | undefined> {
  const identifier = `${orgSlug}/${productSlug}`;
  let product: Product | null = await findProduct(identifier);
  if (product) return product.id;
  // Not found — create it.
  product = await createProduct(orgId, productName, { slug: productSlug });
  return product.id;
}

export function registerOnboardApplyCommand(onboardCmd: Command) {
  onboardCmd
    .command("apply")
    .description("Apply discovery results from a state file to the database")
    .argument("<state-file>", "Path to a DiscoveryState JSON file (or - for stdin)")
    .option("--json", "Output results as JSON")
    .action(async (stateFile: string, opts: { json?: boolean }) => {
      const raw = stateFile === "-" ? await Bun.stdin.text() : await Bun.file(stateFile).text();

      let state: DiscoveryState;
      try {
        state = JSON.parse(raw);
      } catch {
        logger.error("Failed to parse state file as JSON");
        process.exit(1);
      }

      if (!state.sources || !Array.isArray(state.sources)) {
        logger.error("State file missing 'sources' array");
        process.exit(1);
      }

      const org = await findOrg(state.product);
      const orgId = org?.id;
      const orgSlug = org?.slug;

      // Build a productSlug → productId map by looking up or creating each
      // distinct product tagged across the discovered sources. Sequential to
      // avoid racing on shared org/product lookup-or-create across sources
      // that belong to the same parent entity.
      const productIdMap = new Map<string, string>();
      if (orgId && orgSlug) {
        const seen = new Set<string>();
        for (const source of state.sources) {
          if (source.productSlug && source.productName && !seen.has(source.productSlug)) {
            seen.add(source.productSlug);
            // eslint-disable-next-line no-await-in-loop
            const pid = await resolveProduct(
              orgId,
              orgSlug,
              source.productSlug,
              source.productName,
            );
            if (pid) productIdMap.set(source.productSlug, pid);
          }
        }
      }

      const results: ApplyResult[] = [];

      for (const source of state.sources) {
        const productId = source.productSlug ? productIdMap.get(source.productSlug) : undefined;
        // eslint-disable-next-line no-await-in-loop
        const result = await applySource(source, orgId, productId);
        results.push(result);

        if (!opts.json) {
          switch (result.action) {
            case "added":
              logger.info(chalk.green(`Added: ${result.slug} (${result.url})`));
              break;
            case "ignored":
              logger.info(chalk.yellow(`Ignored: ${result.slug} (${result.url})`));
              break;
            case "skipped":
              logger.info(chalk.gray(`Skipped (no approval): ${result.slug}`));
              break;
            case "error":
              logger.error(chalk.red(`Error: ${result.slug} -- ${result.error}`));
              break;
          }
        }
      }

      if (opts.json) {
        await writeJson(results);
      } else {
        let added = 0,
          ignored = 0,
          errors = 0;
        for (const r of results) {
          if (r.action === "added") added++;
          else if (r.action === "ignored") ignored++;
          else if (r.action === "error") errors++;
        }
        logger.info(chalk.bold(`\nApplied: ${added} added, ${ignored} ignored, ${errors} errors`));
      }

      if (results.some((r) => r.action === "error")) process.exit(1);
    });
}
