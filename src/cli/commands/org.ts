import { Command } from "commander";
import chalk from "chalk";
import Table from "cli-table3";
import {
  findOrg,
  getSourcesByOrg,
  listOrgs,
  createOrg,
  removeOrg,
  getOrgAccountsBySlug,
  linkOrgAccount,
  unlinkOrgAccount,
  getProductsByOrg,
  addTagsToOrg,
  removeTagsFromOrg,
  getTagsForOrg,
  updateOrg,
  getAliases,
  setAliases,
  getOverview,
  getOrgDependents,
} from "../../api/client.js";
import { promptConfirm } from "../../lib/confirm.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { logger } from "@releases/lib/logger";
import { orgNotFound } from "../suggest.js";
import { toSlug } from "@buildinternet/releases-core/slug";
import { isValidCategory, CATEGORIES } from "@buildinternet/releases-core/categories";
import { timeAgo } from "@buildinternet/releases-core/dates";
import { writeJson } from "../../lib/output.js";
import {
  OVERVIEW_STALE_DAYS,
  overviewAgeDays,
  isOverviewStale,
  overviewPreview,
} from "@buildinternet/releases-core/overview";

export function registerOrgCommand(program: Command) {
  const org = program.command("org").description("Manage organizations");

  // ── org add ──
  org
    .command("add")
    .description("Add a new organization")
    .argument("<name>", "Organization name")
    .option("--domain <domain>", "Primary domain")
    .option("--slug <slug>", "Custom slug")
    .option("--description <text>", "Brief product description")
    .option("--category <category>", "Category")
    .option("--tags <tags>", "Comma-separated tags")
    .option("--json", "Output as JSON")
    .action(
      async (
        name: string,
        opts: {
          domain?: string;
          slug?: string;
          description?: string;
          category?: string;
          tags?: string;
          json?: boolean;
        },
      ) => {
        const slug = opts.slug ?? toSlug(name);

        const existing = await findOrg(slug);
        if (existing) {
          console.error(chalk.red(`Organization with slug "${slug}" already exists.`));
          process.exit(1);
        }

        if (opts.category && !isValidCategory(opts.category)) {
          console.error(
            chalk.red(`Invalid category: "${opts.category}". Valid: ${CATEGORIES.join(", ")}`),
          );
          process.exit(1);
        }

        const created = await createOrg(name, {
          slug,
          domain: opts.domain,
          description: opts.description,
          category: opts.category,
        });

        if (opts.tags) {
          const tagList = opts.tags
            .split(",")
            .map((t: string) => t.trim())
            .filter(Boolean);
          if (tagList.length > 0) {
            await addTagsToOrg(created.id, tagList);
          }
        }

        if (opts.json) await writeJson(created);
        else console.log(chalk.green(`Organization added: ${name} (${slug})`));
      },
    );

  // ── org list ──
  org
    .command("list")
    .description("List all organizations")
    .option("--query <text>", "Filter by name, slug, domain, or handle")
    .option("--platform <platform>", "Filter to orgs with an account on this platform")
    .option("--json", "Output as JSON")
    .action(async (opts: { query?: string; platform?: string; json?: boolean }) => {
      const allOrgs = await listOrgs({ query: opts.query, platform: opts.platform });

      if (allOrgs.length === 0) {
        if (opts.json) await writeJson([]);
        else console.log(chalk.yellow("No organizations found."));
        return;
      }

      if (opts.json) {
        await writeJson(allOrgs);
        return;
      }

      const table = new Table({
        head: [chalk.cyan("Name"), chalk.cyan("Slug"), chalk.cyan("Domain"), chalk.cyan("Updated")],
      });

      for (const o of allOrgs) {
        table.push([o.name, o.slug, o.domain ?? chalk.dim("—"), o.updatedAt]);
      }

      console.log(table.toString());
    });

  // ── org show ──
  org
    .command("show")
    .description("Show organization details")
    .argument("<identifier>", "Org slug, domain, name, or account handle")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);

      const [accounts, orgProducts, linkedSources, orgTags, aliases, overview] = await Promise.all([
        getOrgAccountsBySlug(found.slug),
        getProductsByOrg(found.id),
        getSourcesByOrg(found.id),
        getTagsForOrg(found.id),
        getAliases("org", found.slug),
        getOverview("org", found.slug).catch(() => null),
      ]);

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              ...found,
              accounts,
              products: orgProducts,
              sources: linkedSources,
              tags: orgTags,
              aliases,
              overview: overview?.content ?? null,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(chalk.bold(found.name));
      console.log(`  Slug:    ${found.slug}`);
      console.log(`  Domain:  ${found.domain ?? chalk.dim("—")}`);
      if (aliases.length > 0) console.log(`  Aliases: ${aliases.join(", ")}`);
      if (found.description) console.log(`  About:   ${found.description}`);
      console.log(`  Created: ${found.createdAt}`);
      console.log(`  Updated: ${found.updatedAt}`);
      if (found.category) console.log(`  Category: ${found.category}`);
      if (orgTags.length > 0) console.log(`  Tags:    ${orgTags.join(", ")}`);

      if (accounts.length > 0) {
        console.log();
        console.log(chalk.bold("Accounts:"));
        for (const a of accounts) console.log(`  ${chalk.cyan(a.platform)}  ${a.handle}`);
      }

      if (orgProducts.length > 0) {
        console.log();
        console.log(chalk.bold("Products:"));
        for (const p of orgProducts) {
          const urlLabel = p.url ? chalk.dim(` ${p.url}`) : "";
          console.log(`  ${chalk.cyan(p.slug)}  ${p.name}  (${p.sourceCount} sources)${urlLabel}`);
        }
      }

      if (linkedSources.length > 0) {
        console.log();
        console.log(chalk.bold("Sources:"));
        for (const s of linkedSources) {
          const statusLabel = s.isHidden
            ? "disabled"
            : s.consecutiveErrors && s.consecutiveErrors > 0
              ? "erroring"
              : "active";
          const statusColor = s.isHidden
            ? chalk.red
            : s.consecutiveErrors
              ? chalk.yellow
              : chalk.green;
          const status = statusColor(statusLabel.padEnd(16));
          const fetched = s.lastFetchedAt
            ? chalk.dim(s.lastFetchedAt.replace("T", " ").replace(/\.\d+Z$/, ""))
            : chalk.dim("never fetched");
          console.log(`  ${chalk.cyan(s.slug.padEnd(30))} ${status} ${fetched}`);
          console.log(`  ${" ".repeat(30)} ${chalk.dim(s.url)}`);
        }
      }

      if (overview?.content) {
        const preview = overviewPreview(stripAnsi(overview.content));
        const stale = overview.generatedAt ? isOverviewStale(overview.generatedAt) : false;
        const generatedHint = overview.generatedAt
          ? chalk.dim(`generated ${timeAgo(overview.generatedAt) ?? "?"}`)
          : "";

        console.log();
        console.log(`${chalk.bold("Overview")}  ${generatedHint}`);
        if (stale) {
          console.log(
            chalk.yellow(
              `  ⚠ Overview is older than ${OVERVIEW_STALE_DAYS} days — may not reflect recent releases.`,
            ),
          );
        }
        console.log(preview);
        console.log(chalk.dim(`\n  Full overview: releases org overview ${found.slug}`));
      }
    });

  // ── org overview ──
  org
    .command("overview")
    .description("Print the full AI-generated overview for an organization")
    .argument("<identifier>", "Org slug, domain, name, or account handle")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases org overview acme
  releases org overview acme --json`,
    )
    .action(async (identifier: string, opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);

      const overview = await getOverview("org", found.slug).catch(() => null);

      if (!overview?.content) {
        if (opts.json) {
          await writeJson({ org: found.slug, overview: null });
        } else {
          console.log(chalk.yellow(`No overview available for ${found.name}.`));
        }
        return;
      }

      const stale = overview.generatedAt ? isOverviewStale(overview.generatedAt) : false;
      const ageDays = overview.generatedAt ? overviewAgeDays(overview.generatedAt) : null;

      if (opts.json) {
        console.log(
          JSON.stringify(
            {
              org: found.slug,
              name: found.name,
              generatedAt: overview.generatedAt,
              updatedAt: overview.updatedAt,
              lastContributingReleaseAt: overview.lastContributingReleaseAt,
              releaseCount: overview.releaseCount,
              stale,
              ageDays,
              content: overview.content,
            },
            null,
            2,
          ),
        );
        return;
      }

      console.log(chalk.bold(`${found.name} — overview`));
      if (overview.generatedAt) {
        console.log(
          chalk.dim(
            `  generated ${timeAgo(overview.generatedAt) ?? "?"} · ${overview.releaseCount} releases`,
          ),
        );
      }
      if (stale) {
        console.log(
          chalk.yellow(
            `  ⚠ Overview is older than ${OVERVIEW_STALE_DAYS} days — may not reflect recent releases.`,
          ),
        );
      }
      console.log();
      console.log(stripAnsi(overview.content));
    });

  // ── org edit ──
  org
    .command("edit")
    .description("Edit an organization")
    .argument("<identifier>", "Org slug, domain, or name")
    .option("--name <name>", "Update display name")
    .option("--slug <slug>", "Update slug")
    .option("--domain <domain>", "Update domain")
    .option("--description <text>", "Update description")
    .option("--category <category>", "Set category")
    .option("--no-category", "Clear category")
    .option("--avatar <url>", "Set avatar image URL")
    .option("--no-avatar", "Clear avatar URL")
    .option("--json", "Output as JSON")
    .action(
      async (
        identifier: string,
        opts: {
          name?: string;
          slug?: string;
          domain?: string;
          description?: string;
          category?: string | boolean;
          avatar?: string | boolean;
          json?: boolean;
        },
      ) => {
        const found = await findOrg(identifier);
        if (!found) return orgNotFound(identifier);

        const updates: Record<string, unknown> = {};
        if (opts.name !== undefined) updates.name = opts.name;
        if (opts.slug !== undefined) updates.slug = opts.slug;
        if (opts.domain !== undefined) updates.domain = opts.domain;
        if (opts.description !== undefined) updates.description = opts.description;

        if (opts.category === false) {
          updates.category = null;
        } else if (typeof opts.category === "string") {
          if (!isValidCategory(opts.category)) {
            console.error(
              chalk.red(`Invalid category: "${opts.category}". Valid: ${CATEGORIES.join(", ")}`),
            );
            process.exit(1);
          }
          updates.category = opts.category;
        }

        if (opts.avatar === false) updates.avatarUrl = null;
        else if (typeof opts.avatar === "string") updates.avatarUrl = opts.avatar;

        if (Object.keys(updates).length === 0) {
          console.error(chalk.yellow("No fields to update."));
          process.exit(1);
        }

        const updated = await updateOrg(found.slug, updates);

        if (opts.json) await writeJson(updated);
        else console.log(chalk.green(`Updated organization: ${updated.name} (${updated.slug})`));
      },
    );

  // ── org remove / delete ──
  // Defaults to a tombstone soft-delete (reversible). With --hard, the row is
  // purged and the FK cascade also wipes every source, release, fetch_log,
  // changelog file/chunk, release summary, media asset, and webhook
  // subscription tied to the org (#690 Phase C). The command surfaces a
  // typeback prompt before any cascade runs; --yes / -y bypasses it for
  // scripted ops, and a piped (non-TTY) stdin without --yes errors out
  // rather than silently confirming.
  org
    .command("remove")
    .alias("delete")
    .description("Remove an organization (soft-delete by default; --hard purges with cascade)")
    .argument("<identifier>", "Org slug, domain, name, or handle")
    .option("--dry-run", "Show what would be removed without deleting")
    .option("--hard", "Permanently delete the org and cascade-delete all dependent rows")
    .option("-y, --yes", "Skip the confirmation prompt (required for non-interactive --hard)")
    .option("--json", "Output as JSON")
    .action(
      async (
        identifier: string,
        opts: { json?: boolean; dryRun?: boolean; hard?: boolean; yes?: boolean },
      ) => {
        // Fail fast on the obvious misconfiguration: --hard from a piped
        // stdin without --yes. Applies to --dry-run too — a scripted hard
        // delete that "works" in dry-run only to error in the real run is
        // a worse outcome than a single up-front complaint.
        if (opts.hard && !opts.yes && !process.stdin.isTTY) {
          console.error(
            chalk.red(
              "No interactive TTY available — pass --yes to confirm a hard delete in scripted contexts.",
            ),
          );
          process.exit(1);
        }

        const found = await findOrg(identifier);
        if (!found) return orgNotFound(identifier);

        if (opts.dryRun) {
          if (opts.json)
            await writeJson({ wouldRemove: found.slug, name: found.name, hard: !!opts.hard });
          else
            console.log(
              chalk.yellow(
                `[dry-run] Would ${opts.hard ? "hard-delete" : "remove"} organization: ${found.name} (${found.slug})`,
              ),
            );
          return;
        }

        if (opts.hard && !opts.yes) {
          let dependents;
          try {
            dependents = await getOrgDependents(found.slug);
          } catch (err) {
            console.error(
              chalk.red(
                `Failed to load cascade preview: ${err instanceof Error ? err.message : err}`,
              ),
            );
            process.exit(1);
          }

          const c = dependents.counts;
          console.error("");
          console.error(chalk.bold.red("This will permanently delete:"));
          console.error(`  - 1 organization (${found.name}, slug: ${found.slug})`);
          console.error(`  - ${c.sources.toLocaleString()} sources`);
          console.error(`  - ${c.releases.toLocaleString()} releases`);
          console.error(`  - ${c.sourceChangelogChunks.toLocaleString()} changelog chunks`);
          console.error(`  - ${c.sourceChangelogFiles.toLocaleString()} changelog files`);
          console.error(`  - ${c.fetchLog.toLocaleString()} fetch log entries`);
          console.error(`  - ${c.releaseSummaries.toLocaleString()} release summaries`);
          console.error(`  - ${c.mediaAssets.toLocaleString()} media assets`);
          console.error(`  - ${c.webhookSubscriptions.toLocaleString()} webhook subscriptions`);
          console.error("");
          console.error(chalk.red("This is irreversible."));

          const confirmed = await promptConfirm(`Type the org slug to confirm: `, found.slug);
          if (!confirmed) {
            console.error(chalk.yellow("Slug did not match. Aborted."));
            process.exit(1);
          }
        }

        await removeOrg(found.slug, { hard: opts.hard });

        if (opts.json) await writeJson({ removed: found.slug, hard: !!opts.hard });
        else
          console.log(
            chalk.green(
              `${opts.hard ? "Hard-deleted" : "Removed"} organization: ${found.name} (${found.slug})`,
            ),
          );
      },
    );

  // ── org link ──
  org
    .command("link")
    .description("Link a platform account to an organization")
    .argument("<identifier>", "Org slug, domain, name, or handle")
    .requiredOption("--platform <platform>", "Platform name (github, x, etc.)")
    .requiredOption("--handle <handle>", "Account handle on the platform")
    .option("--json", "Output as JSON")
    .action(
      async (identifier: string, opts: { platform: string; handle: string; json?: boolean }) => {
        const found = await findOrg(identifier);
        if (!found) return orgNotFound(identifier);

        const created = await linkOrgAccount(found.slug, opts.platform, opts.handle);

        if (opts.json) await writeJson(created);
        else console.log(chalk.green(`Linked ${opts.platform}/${opts.handle} to ${found.name}`));
      },
    );

  // ── org unlink ──
  org
    .command("unlink")
    .description("Remove a platform account from an organization")
    .argument("<identifier>", "Org slug")
    .requiredOption("--platform <platform>", "Platform name")
    .requiredOption("--handle <handle>", "Account handle")
    .option("--json", "Output as JSON")
    .action(
      async (identifier: string, opts: { platform: string; handle: string; json?: boolean }) => {
        const found = await findOrg(identifier);
        if (!found) return orgNotFound(identifier);

        await unlinkOrgAccount(found.slug, opts.platform, opts.handle);

        if (opts.json) await writeJson({ unlinked: `${opts.platform}/${opts.handle}` });
        else
          console.log(chalk.green(`Unlinked ${opts.platform}/${opts.handle} from ${found.name}`));
      },
    );

  // ── org tag ──
  const tag = org.command("tag").description("Manage organization tags");

  tag
    .command("add")
    .description("Add tags to an organization")
    .argument("<identifier>", "Org slug")
    .argument("<tags...>", "Tag names to add")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, tagNames: string[], opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);
      await addTagsToOrg(found.id, tagNames);
      if (opts.json) {
        const allTags = await getTagsForOrg(found.id);
        await writeJson({ tags: allTags });
      } else {
        console.log(chalk.green(`Added tags to ${found.name}: ${tagNames.join(", ")}`));
      }
    });

  tag
    .command("remove")
    .description("Remove tags from an organization")
    .argument("<identifier>", "Org slug")
    .argument("<tags...>", "Tag names to remove")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, tagNames: string[], opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);
      await removeTagsFromOrg(found.id, tagNames);
      if (opts.json) {
        const allTags = await getTagsForOrg(found.id);
        await writeJson({ tags: allTags });
      } else {
        console.log(chalk.green(`Removed tags from ${found.name}: ${tagNames.join(", ")}`));
      }
    });

  tag
    .command("list")
    .description("List tags for an organization")
    .argument("<identifier>", "Org slug")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);
      const allTags = await getTagsForOrg(found.id);
      if (opts.json) await writeJson(allTags);
      else if (allTags.length === 0) console.log(chalk.yellow(`No tags for ${found.name}`));
      else console.log(allTags.join(", "));
    });

  // ── org alias ──
  const alias = org.command("alias").description("Manage domain aliases for an organization");

  alias
    .command("add")
    .description("Add domain aliases to an organization")
    .argument("<identifier>", "Org slug")
    .argument("<domains...>", "Domain names to add")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, domains: string[], opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);

      const current = await getAliases("org", found.slug);
      const currentSet = new Set(current);
      const added: string[] = [];
      for (const d of domains) {
        if (!currentSet.has(d)) {
          currentSet.add(d);
          added.push(d);
        }
      }
      if (added.length > 0) {
        try {
          await setAliases("org", found.slug, [...currentSet]);
        } catch (err) {
          logger.error(
            chalk.red(`Failed to add aliases: ${err instanceof Error ? err.message : err}`),
          );
          return;
        }
      }

      if (opts.json) await writeJson({ added });
      else for (const d of added) console.log(chalk.green(`Added alias: ${d} → ${found.name}`));
    });

  alias
    .command("remove")
    .description("Remove domain aliases from an organization")
    .argument("<identifier>", "Org slug")
    .argument("<domains...>", "Domain names to remove")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, domains: string[], opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);

      const current = await getAliases("org", found.slug);
      const currentSet = new Set(current);
      const removed: string[] = [];
      for (const d of domains) {
        if (currentSet.delete(d)) removed.push(d);
        else console.error(chalk.yellow(`Alias "${d}" not found.`));
      }
      if (removed.length > 0) await setAliases("org", found.slug, [...currentSet]);

      if (opts.json) await writeJson({ removed });
      else for (const d of removed) console.log(chalk.green(`Removed alias: ${d}`));
    });

  alias
    .command("list")
    .description("List domain aliases for an organization")
    .argument("<identifier>", "Org slug")
    .option("--json", "Output as JSON")
    .action(async (identifier: string, opts: { json?: boolean }) => {
      const found = await findOrg(identifier);
      if (!found) return orgNotFound(identifier);

      const aliases = await getAliases("org", found.slug);

      if (opts.json) await writeJson(aliases);
      else if (aliases.length === 0)
        console.log(chalk.yellow(`No domain aliases for ${found.name}`));
      else for (const d of aliases) console.log(d);
    });
}
