import { Command } from "commander";
import chalk from "chalk";
import { readFile } from "node:fs/promises";
import { findOrg, getOverviewInputs, upsertOverview } from "../../../../api/client.js";
import { orgNotFound } from "../../../suggest.js";
import { writeJson } from "../../../../lib/output.js";

interface OverviewWriteOpts {
  contentFile: string;
  releaseCount?: string;
  lastContributingAt?: string;
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
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview-write vercel --content-file /tmp/vercel-overview.md
  releases admin overview-write vercel --content-file - --json   (reads stdin)

Writes via the upsert at POST /v1/overview. Last-write-wins on conflict.
When --release-count or --last-contributing-at are omitted, the CLI re-fetches
overview-inputs to derive them.`,
    )
    .action(async (orgIdentifier: string, opts: OverviewWriteOpts) => {
      const org = await findOrg(orgIdentifier);
      if (!org) return orgNotFound(orgIdentifier);

      const content = await readContent(opts.contentFile);
      if (!content.trim()) {
        console.error(chalk.red("Content is empty — refusing to write."));
        process.exit(2);
      }

      let releaseCount = opts.releaseCount === undefined ? undefined : Number(opts.releaseCount);
      let lastContributingAt = opts.lastContributingAt ?? undefined;

      if (releaseCount === undefined || lastContributingAt === undefined) {
        const inputs = await getOverviewInputs(org.slug);
        if (releaseCount === undefined) releaseCount = inputs.totalAvailable;
        if (lastContributingAt === undefined) {
          lastContributingAt = inputs.selected[0]?.publishedAt ?? undefined;
        }
      }

      await upsertOverview({
        scope: "org",
        orgId: org.id,
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
  if (path === "-") {
    return await readStdin();
  }
  return await readFile(path, "utf8");
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      data += chunk;
    });
    process.stdin.on("end", () => resolve(data));
    process.stdin.on("error", reject);
  });
}
