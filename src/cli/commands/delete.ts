import { Command } from "commander";
import chalk from "chalk";
import { findSourcesBySlugs, deleteSources, addIgnoredUrl } from "../../api/client.js";
import { logger } from "@releases/lib/logger";
import { writeJson } from "../../lib/output.js";

export type DeleteSourceOpts = {
  ignore?: boolean;
  reason?: string;
  json?: boolean;
  dryRun?: boolean;
};

/** Shared action for both the canonical `delete` command and the deprecated `remove` alias. */
export async function deleteSourceAction(slugs: string[], opts: DeleteSourceOpts): Promise<void> {
  const existing = await findSourcesBySlugs(slugs);

  const foundSlugs = new Set(existing.map((s) => s.slug));
  const results: {
    slug: string;
    name?: string;
    url?: string;
    status: "removed" | "not_found";
    ignored?: boolean;
  }[] = [];
  let hasError = false;

  if (opts.dryRun) {
    const dryResults = slugs.map((slug) => {
      const found = existing.find((s) => s.slug === slug);
      return found
        ? { slug, name: found.name, url: found.url, status: "would_remove" as const }
        : { slug, status: "not_found" as const };
    });

    if (opts.json) {
      await writeJson(dryResults);
    } else {
      for (const r of dryResults) {
        if (r.status === "not_found") console.error(chalk.red(`Source not found: ${r.slug}`));
        else console.log(chalk.yellow(`[dry-run] Would remove: ${r.name} (${r.slug})`));
      }
    }

    if (dryResults.some((r) => r.status === "not_found")) process.exit(1);
    return;
  }

  for (const slug of slugs) {
    if (!foundSlugs.has(slug)) {
      results.push({ slug, status: "not_found" });
      logger.error(`Source not found: ${slug}`);
      hasError = true;
    }
  }

  const ignoredUrlSet = new Set<string>();
  if (opts.ignore && existing.length > 0) {
    const ignorable = existing.filter((source) => {
      if (source.orgId) return true;
      if (!opts.json) {
        logger.warn(
          chalk.yellow(
            `Cannot ignore ${source.url} — source has no organization. Use 'block add' for global blocking.`,
          ),
        );
      }
      return false;
    });
    await Promise.all(
      ignorable.map((source) => addIgnoredUrl(source.url, source.orgId!, opts.reason)),
    );
    for (const source of ignorable) {
      ignoredUrlSet.add(source.url);
      if (!opts.json) {
        logger.info(
          chalk.yellow(`Ignored URL: ${source.url}${opts.reason ? ` (${opts.reason})` : ""}`),
        );
      }
    }
  }

  if (existing.length > 0) {
    await deleteSources(existing);

    for (const source of existing) {
      results.push({
        slug: source.slug,
        name: source.name,
        url: source.url,
        status: "removed",
        ...(opts.ignore && ignoredUrlSet.has(source.url) ? { ignored: true } : {}),
      });
      if (!opts.json) {
        logger.info(chalk.green(`Removed source: ${source.name} (${source.slug})`));
      }
    }
  }

  if (opts.json) await writeJson(results);
  if (hasError) process.exit(1);
}

export function registerDeleteCommand(program: Command) {
  program
    .command("delete")
    .description("Delete one or more changelog sources by slug")
    .argument("<slugs...>", "Slugs of sources to delete")
    .option("--ignore", "Add each source URL to the ignored list before deleting")
    .option("--reason <reason>", "Reason for ignoring (used with --ignore)")
    .option("--dry-run", "Show what would be deleted without deleting")
    .option("--json", "Output as JSON")
    .action(deleteSourceAction);
}
