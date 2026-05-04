import { Command } from "commander";
import chalk from "chalk";
import {
  findSource,
  findOrg,
  createOrg,
  updateSource,
  findProduct,
  updateSourceMeta,
} from "../../api/client.js";
import { sourceNotFound } from "../suggest.js";
import { toSlug } from "@buildinternet/releases-core/slug";
import { logger } from "@releases/lib/logger";
import { writeJson } from "../../lib/output.js";

const VALID_TYPES = ["github", "scrape", "feed", "agent"] as const;

function inferFeedTypeFromUrl(url: string): "rss" | "atom" | "jsonfeed" {
  const lower = url.toLowerCase();
  if (lower.endsWith(".json") || lower.includes("feed.json")) return "jsonfeed";
  if (lower.includes("atom")) return "atom";
  return "rss";
}

export type UpdateSourceOpts = {
  name?: string;
  url?: string;
  type?: string;
  slug?: string;
  confirmSlugChange?: boolean;
  org?: string | boolean;
  product?: string | boolean;
  feedUrl?: string | boolean;
  json?: boolean;
  markdownUrl?: string;
  provider?: string;
  fetchMethod?: string;
  parseInstructions?: string | boolean;
  render?: boolean;
  primary?: boolean;
  priority?: string;
  disable?: boolean;
  enable?: boolean;
};

/** Shared action for both the canonical `update` command and the deprecated `edit` alias. */
export async function updateSourceAction(
  identifier: string,
  opts: UpdateSourceOpts,
): Promise<void> {
  const source = await findSource(identifier);
  if (!source) return sourceNotFound(identifier);

  if (opts.type && !(VALID_TYPES as readonly string[]).includes(opts.type)) {
    console.error(
      chalk.red(`Invalid type "${opts.type}". Must be one of: ${VALID_TYPES.join(", ")}`),
    );
    process.exit(1);
  }

  const VALID_METHODS = ["feed", "markdown", "scrape", "crawl", "github"];
  if (opts.fetchMethod && !VALID_METHODS.includes(opts.fetchMethod)) {
    console.error(
      chalk.red(
        `Invalid fetch method "${opts.fetchMethod}". Must be one of: ${VALID_METHODS.join(", ")}`,
      ),
    );
    process.exit(1);
  }

  if (opts.slug && !opts.confirmSlugChange) {
    console.error(chalk.red("Slug changes break existing web links and bookmarks."));
    console.error(chalk.yellow(`  Current: releases.sh/${source.slug}`));
    console.error(chalk.yellow(`  New:     releases.sh/${opts.slug}`));
    console.error(`\nAdd ${chalk.bold("--confirm-slug-change")} to proceed.`);
    process.exit(1);
  }

  const updates: Record<string, unknown> = {};
  const changes: string[] = [];

  if (opts.name) {
    updates.name = opts.name;
    changes.push(`name → ${opts.name}`);
  }
  if (opts.url) {
    updates.url = opts.url;
    changes.push(`url → ${opts.url}`);
  }
  if (opts.type) {
    updates.type = opts.type;
    changes.push(`type → ${opts.type}`);
  }
  if (opts.slug) {
    updates.slug = opts.slug;
    changes.push(`slug → ${opts.slug}`);
  }

  if (opts.org === false) {
    updates.orgId = null;
    changes.push("org removed");
  } else if (typeof opts.org === "string") {
    let org = await findOrg(opts.org);
    if (!org) {
      org = await createOrg(opts.org, { slug: toSlug(opts.org) });
      logger.info(`Created organization: ${org.name} (${org.slug})`);
    }
    updates.orgId = org.id;
    changes.push(`org → ${org.name}`);
  }

  if (opts.product === false) {
    updates.productId = null;
    changes.push("product removed");
  } else if (typeof opts.product === "string") {
    const prod = await findProduct(opts.product);
    if (!prod) {
      console.error(chalk.red(`Product not found: ${opts.product}`));
      process.exit(1);
    }
    updates.productId = prod.id;
    changes.push(`product → ${prod.name}`);
  }

  if (opts.primary !== undefined) {
    updates.isPrimary = opts.primary;
    changes.push(opts.primary ? "marked as primary" : "unmarked as primary");
  }

  if (opts.priority) {
    const validPriorities = ["normal", "low", "paused"];
    if (!validPriorities.includes(opts.priority)) {
      console.error(
        chalk.red(
          `Invalid priority "${opts.priority}". Must be one of: ${validPriorities.join(", ")}`,
        ),
      );
      process.exit(1);
    }
    updates.fetchPriority = opts.priority;
    changes.push(`priority → ${opts.priority}`);
  }

  if (opts.disable) {
    updates.isHidden = true;
    changes.push("disabled");
  } else if (opts.enable) {
    updates.isHidden = false;
    changes.push("enabled");
  }

  const metaUpdates: Record<string, unknown> = {};

  if (opts.feedUrl === false) {
    Object.assign(metaUpdates, {
      feedUrl: undefined,
      feedType: undefined,
      feedDiscoveredAt: undefined,
      noFeedFound: true,
    });
    changes.push("feed URL removed (feed discovery disabled)");
  } else if (typeof opts.feedUrl === "string") {
    const feedType = inferFeedTypeFromUrl(opts.feedUrl);
    Object.assign(metaUpdates, {
      feedUrl: opts.feedUrl,
      feedType,
      feedDiscoveredAt: new Date().toISOString(),
      noFeedFound: false,
    });
    changes.push(`feed URL → ${opts.feedUrl} (${feedType})`);
  }

  if (opts.markdownUrl) {
    metaUpdates.markdownUrl = opts.markdownUrl;
    changes.push(`markdown URL → ${opts.markdownUrl}`);
  }

  if (opts.provider) {
    metaUpdates.provider = opts.provider;
    metaUpdates.providerDetectedAt = new Date().toISOString();
    changes.push(`provider → ${opts.provider}`);
  }

  if (opts.fetchMethod) {
    metaUpdates.evaluatedMethod = opts.fetchMethod;
    metaUpdates.evaluatedAt = new Date().toISOString();
    changes.push(`fetch method → ${opts.fetchMethod}`);
  }

  if (opts.parseInstructions === false || opts.parseInstructions === "") {
    metaUpdates.parseInstructions = undefined;
    changes.push("parse instructions removed");
  } else if (typeof opts.parseInstructions === "string") {
    metaUpdates.parseInstructions = opts.parseInstructions;
    changes.push(
      `parse instructions → "${opts.parseInstructions.slice(0, 60)}${opts.parseInstructions.length > 60 ? "..." : ""}"`,
    );
  }

  if (opts.render === true) {
    metaUpdates.renderRequired = true;
    changes.push("rendering → required (headless browser)");
  } else if (opts.render === false) {
    metaUpdates.renderRequired = false;
    changes.push("rendering → disabled (fast fetch)");
  }

  if (Object.keys(metaUpdates).length > 0) {
    await updateSourceMeta(source, metaUpdates);
  }

  if (Object.keys(updates).length > 0) {
    const updated = await updateSource(source, updates);
    if (opts.slug && updated.slug !== opts.slug) {
      const idx = changes.findIndex((c) => c.startsWith("slug →"));
      if (idx !== -1) changes.splice(idx, 1);
      logger.warn(`Slug was not updated (API returned slug="${updated.slug}")`);
    }
  }

  if (changes.length === 0) {
    console.log(chalk.yellow("No changes specified. Use --help to see options."));
    return;
  }

  const displaySlug = opts.slug ?? source.slug;

  if (opts.json) {
    const refreshed = await findSource(displaySlug);
    await writeJson(refreshed);
  } else {
    console.log(chalk.green(`Updated ${source.name} (${displaySlug}):`));
    for (const change of changes) console.log(`  ${change}`);
  }
}

function attachUpdateOptions(cmd: Command): Command {
  return cmd
    .argument("<identifier>", "Source ID (src_...) or slug")
    .option("--name <name>", "Update display name")
    .option("--url <url>", "Update source URL")
    .option("--type <type>", "Update source type (github, scrape, feed, agent)")
    .option("--slug <newSlug>", "Update slug (requires --confirm-slug-change; breaks web links)")
    .option("--confirm-slug-change", "Confirm slug rename")
    .option("--org <org>", "Set organization")
    .option("--no-org", "Remove organization association")
    .option("--product <product>", "Set product (slug)")
    .option("--no-product", "Remove product association")
    .option("--feed-url <feedUrl>", "Set or update the feed URL")
    .option("--no-feed-url", "Remove stored feed URL")
    .option("--markdown-url <markdownUrl>", "Set the raw markdown URL for this source")
    .option("--parse-instructions <text>", "Set AI parsing instructions for this source")
    .option("--no-parse-instructions", "Remove AI parsing instructions")
    .option("--render", "Force headless browser rendering for this source")
    .option("--no-render", "Allow fast fetch without headless browser rendering")
    .option("--provider <provider>", "Set the detected provider")
    .option("--fetch-method <fetchMethod>", "Set the recommended fetch method")
    .option("--primary", "Mark as the org's primary changelog source")
    .option("--no-primary", "Unmark as primary")
    .option("--priority <level>", "Set fetch priority (normal, low, paused)")
    .option("--disable", "Disable source")
    .option("--enable", "Re-enable a disabled source")
    .option("--json", "Output as JSON");
}

export function registerUpdateCommand(program: Command) {
  attachUpdateOptions(
    program.command("update").description("Update an existing changelog source"),
  ).action(updateSourceAction);
}
