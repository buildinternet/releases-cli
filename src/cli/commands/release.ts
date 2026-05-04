import { Command } from "commander";
import { createHash } from "crypto";
import chalk from "chalk";
import {
  findSource,
  suppressRelease,
  unsuppressRelease,
  getRelease,
  deleteRelease,
  updateRelease,
  deleteReleasesForSource,
} from "../../api/client.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { normalizeReleaseId } from "@buildinternet/releases-core/id";
import { writeJson, writeJsonLine } from "../../lib/output.js";
import { warnDeprecatedAlias } from "../../lib/deprecated-alias.js";

function releaseNotFound(id: string): never {
  console.error(chalk.red(`Release not found: ${id}`));
  process.exit(1);
}

// ── Shared action handlers ────────────────────────────────────────────────────

type ReleaseGetOpts = { json?: boolean };

async function releaseGetAction(rawId: string, opts: ReleaseGetOpts): Promise<void> {
  const id = normalizeReleaseId(rawId);
  const result = await getRelease(id);

  if (!result) releaseNotFound(id);

  const rel = result;

  if (opts.json) {
    await writeJson(rel);
    return;
  }

  console.log(chalk.bold(stripAnsi(rel.title)));
  if (rel.version) console.log(`  Version:   ${stripAnsi(rel.version)}`);
  console.log(
    `  Source:    ${rel.sourceName ? stripAnsi(rel.sourceName) : chalk.dim("—")} (${rel.sourceSlug ?? chalk.dim("—")})`,
  );
  if (rel.publishedAt) console.log(`  Published: ${rel.publishedAt}`);
  console.log(`  Fetched:   ${rel.fetchedAt}`);
  if (rel.suppressed)
    console.log(
      `  ${chalk.yellow("Suppressed")}${rel.suppressedReason ? `: ${stripAnsi(rel.suppressedReason)}` : ""}`,
    );
  if (rel.url) console.log(`  URL:       ${rel.url}`);

  if (rel.contentSummary) {
    console.log();
    console.log(chalk.bold("Summary:"));
    console.log(stripAnsi(rel.contentSummary));
  }

  console.log();
  console.log(chalk.bold("Content:"));
  const sanitizedContent = stripAnsi(rel.content);
  if (sanitizedContent.length > 2000) {
    console.log(sanitizedContent.slice(0, 2000));
    console.log(chalk.dim(`\n... truncated (${sanitizedContent.length} chars total)`));
  } else {
    console.log(sanitizedContent);
  }
}

type ReleaseUpdateOpts = { title?: string; version?: string; content?: string; json?: boolean };

async function releaseUpdateAction(rawId: string, opts: ReleaseUpdateOpts): Promise<void> {
  const id = normalizeReleaseId(rawId);
  const existing = await getRelease(id);
  if (!existing) releaseNotFound(id);

  const updates: Record<string, unknown> = {};
  const changes: string[] = [];

  if (opts.title) {
    updates.title = opts.title;
    changes.push(`title → ${opts.title}`);
  }
  if (opts.version) {
    updates.version = opts.version;
    changes.push(`version → ${opts.version}`);
  }

  if (opts.content) {
    updates.content = opts.content;
    const hash = createHash("sha256").update(opts.content).digest("hex");
    updates.contentHash = hash;
    changes.push(`content → (${opts.content.length} chars)`);
    changes.push(`contentHash → ${hash.slice(0, 12)}…`);
  }

  if (changes.length === 0) {
    console.log(chalk.yellow("No changes specified."));
    return;
  }

  const updated = await updateRelease(id, updates);

  if (opts.json) await writeJson(updated);
  else {
    console.log(chalk.green(`Updated release ${id}:`));
    for (const change of changes) console.log(`  ${change}`);
  }
}

// ── Command registration ──────────────────────────────────────────────────────

export function registerReleaseCommand(program: Command) {
  const release = program.command("release").description("Manage releases");

  // ── release get (canonical) / release show (deprecated) ──
  release
    .command("get")
    .description("Get release details")
    .argument("<id>", "Release ID")
    .option("--json", "Output as JSON")
    .action(releaseGetAction);

  release
    .command("show")
    .description("(deprecated — use get) Show release details")
    .argument("<id>", "Release ID")
    .option("--json", "Output as JSON")
    .action(warnDeprecatedAlias<[string, ReleaseGetOpts]>("show", "get", releaseGetAction));

  release
    .command("delete")
    .description("Delete a release by ID, or all releases for a source")
    .argument("[id]", "Release ID to delete")
    .option("--source <identifier>", "Delete all releases for a source (src_… or slug)")
    .option("--dry-run", "Show what would be deleted without deleting")
    .option("--json", "Output as JSON")
    .action(
      async (
        rawId: string | undefined,
        opts: { source?: string; json?: boolean; dryRun?: boolean },
      ) => {
        const id = rawId ? normalizeReleaseId(rawId) : undefined;
        if (!id && !opts.source) {
          console.error("Error: provide a release ID or --source\n");
          process.exit(1);
        }

        let resolvedSource: Awaited<ReturnType<typeof findSource>> | undefined;
        if (opts.source) {
          resolvedSource = await findSource(opts.source);
          if (!resolvedSource) {
            console.error(chalk.red(`Source not found: ${opts.source}`));
            process.exit(1);
          }
        }

        if (id) {
          if (opts.dryRun) {
            const existing = await getRelease(id);
            if (!existing) releaseNotFound(id);
            if (opts.json) {
              console.log(
                JSON.stringify(
                  { wouldDelete: 1, releases: [{ id, title: existing.title }] },
                  null,
                  2,
                ),
              );
            } else {
              console.log(chalk.yellow(`[dry-run] Would delete 1 release(s)`));
              console.log(`  ${id}  ${stripAnsi(existing.title)}`);
            }
            return;
          }

          const deleted = await deleteRelease(id);
          if (!deleted) {
            console.error(chalk.red("No matching releases found."));
            process.exit(1);
          }
          if (opts.json) await writeJson({ deleted: 1 });
          else console.log(chalk.green(`Deleted 1 release.`));
          return;
        }

        if (resolvedSource) {
          if (opts.dryRun) {
            console.log(
              chalk.yellow(
                `[dry-run] Would delete all releases for source: ${resolvedSource.slug}`,
              ),
            );
            return;
          }
          let result: Awaited<ReturnType<typeof deleteReleasesForSource>>;
          try {
            result = await deleteReleasesForSource(resolvedSource);
          } catch (err) {
            console.error(chalk.red(err instanceof Error ? err.message : String(err)));
            process.exit(1);
          }
          if (opts.json) await writeJson(result);
          else
            console.log(
              chalk.green(`Deleted ${result.deleted} release${result.deleted === 1 ? "" : "s"}.`),
            );
          return;
        }
      },
    );

  // ── release update (canonical) / release edit (deprecated) ──
  release
    .command("update")
    .description("Update a release")
    .argument("<id>", "Release ID")
    .option("--title <title>", "Update title")
    .option("--version <version>", "Update version")
    .option("--content <content>", "Update content (recomputes contentHash)")
    .option("--json", "Output as JSON")
    .action(releaseUpdateAction);

  release
    .command("edit")
    .description("(deprecated — use update) Edit a release")
    .argument("<id>", "Release ID")
    .option("--title <title>", "Update title")
    .option("--version <version>", "Update version")
    .option("--content <content>", "Update content (recomputes contentHash)")
    .option("--json", "Output as JSON")
    .action(
      warnDeprecatedAlias<[string, ReleaseUpdateOpts]>("edit", "update", releaseUpdateAction),
    );

  release
    .command("suppress")
    .description("Suppress a release from appearing in queries and search results")
    .argument("<id>", "Release ID to suppress")
    .option("--reason <reason>", "Reason for suppression")
    .option("--dry-run", "Show what would be suppressed without writing")
    .option("--json", "Output as JSON")
    .action(async (rawId: string, opts: { reason?: string; dryRun?: boolean; json?: boolean }) => {
      const id = normalizeReleaseId(rawId);
      if (opts.dryRun) {
        if (opts.json)
          console.log(
            JSON.stringify({ id, suppressed: true, reason: opts.reason ?? null, dryRun: true }),
          );
        else
          console.log(
            chalk.yellow(
              `[dry-run] Would suppress release ${id}${opts.reason ? ` (${opts.reason})` : ""}`,
            ),
          );
        return;
      }

      const found = await suppressRelease(id, opts.reason);
      if (!found) releaseNotFound(id);

      if (opts.json) await writeJsonLine({ id, suppressed: true, reason: opts.reason ?? null });
      else
        console.log(
          chalk.green(`Suppressed release ${id}${opts.reason ? ` (${opts.reason})` : ""}`),
        );
    });

  release
    .command("unsuppress")
    .description("Restore a suppressed release")
    .argument("<id>", "Release ID to unsuppress")
    .option("--json", "Output as JSON")
    .action(async (rawId: string, opts: { json?: boolean }) => {
      const id = normalizeReleaseId(rawId);
      const found = await unsuppressRelease(id);
      if (!found) releaseNotFound(id);

      if (opts.json) await writeJsonLine({ id, suppressed: false });
      else console.log(chalk.green(`Unsuppressed release ${id}`));
    });
}
