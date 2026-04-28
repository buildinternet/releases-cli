import { Command } from "commander";
import chalk from "chalk";
import { findOrg, getOverviewInputs, upsertOverview } from "../../../../api/client.js";
import { orgNotFound } from "../../../suggest.js";
import { writeJson } from "../../../../lib/output.js";
import { parsePositiveIntFlag } from "../../../../lib/flags.js";
import { unescapeHtmlEntities } from "./unescape-html.js";

interface OverviewWriteOpts {
  contentFile: string;
  releaseCount?: string;
  lastContributingAt?: string;
  unescapeHtml?: boolean;
  json?: boolean;
}

export function registerOverviewWriteCommand(program: Command) {
  program
    .command("overview-write")
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
  releases admin overview-write vercel --content-file /tmp/vercel-overview.md
  releases admin overview-write vercel --content-file - --json   (reads stdin)

Writes via POST /v1/orgs/:slug/overview. Last-write-wins on conflict.
When --release-count or --last-contributing-at are omitted, the CLI re-fetches
overview-inputs to derive them.`,
    )
    .action(async (orgIdentifier: string, opts: OverviewWriteOpts) => {
      const org = await findOrg(orgIdentifier);
      if (!org) return orgNotFound(orgIdentifier);

      let content = await readContent(opts.contentFile);
      if (opts.unescapeHtml) content = unescapeHtmlEntities(content);
      if (!content.trim()) {
        console.error(chalk.red("Content is empty — refusing to write."));
        process.exit(2);
      }

      let releaseCount = parsePositiveIntFlag("release-count", opts.releaseCount);
      let lastContributingAt = opts.lastContributingAt ?? undefined;

      if (releaseCount === undefined || lastContributingAt === undefined) {
        const inputs = await getOverviewInputs(org.slug);
        if (releaseCount === undefined) releaseCount = inputs.totalAvailable;
        if (lastContributingAt === undefined) {
          lastContributingAt = inputs.selected[0]?.publishedAt ?? undefined;
        }
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
        console.log(
          chalk.green(
            `Overview written for ${org.name}: ${content.length} chars, ${releaseCount} releases.`,
          ),
        );
      }
    });
}

async function readContent(path: string): Promise<string> {
  if (path === "-") return Bun.stdin.text();
  return Bun.file(path).text();
}
