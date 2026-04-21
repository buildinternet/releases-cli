import { Command } from "commander";
import chalk from "chalk";
import { findOrg, getOverview } from "../../../../api/client.js";
import { orgNotFound } from "../../../suggest.js";
import { writeJson } from "../../../../lib/output.js";
import { timeAgo } from "@buildinternet/releases-core/dates";

interface OverviewReadOpts {
  json?: boolean;
}

export function registerOverviewReadCommand(program: Command) {
  program
    .command("overview")
    .description("Read an organization's AI overview")
    .argument("<org>", "Organization slug or ID")
    .option("--json", "Output as JSON")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview vercel
  releases admin overview vercel --json

Use \`releases admin overview-inputs\` to inspect what would be sent to the
model on regeneration. Use \`releases admin overview-write\` to upload a new
overview body — see the \`regenerating-overviews\` skill for the workflow.`,
    )
    .action(async (orgIdentifier: string, opts: OverviewReadOpts) => {
      const org = await findOrg(orgIdentifier);
      if (!org) return orgNotFound(orgIdentifier);

      const overview = await getOverview("org", org.slug);
      if (!overview) {
        if (opts.json) {
          await writeJson({ org: org.slug, overview: null });
        } else {
          console.log(chalk.yellow(`No overview available for ${org.name}.`));
        }
        return;
      }

      if (opts.json) {
        await writeJson({
          org: org.slug,
          content: overview.content,
          releaseCount: overview.releaseCount,
          generatedAt: overview.generatedAt,
          updatedAt: overview.updatedAt,
          lastContributingReleaseAt: overview.lastContributingReleaseAt,
        });
        return;
      }

      const ageLabel = overview.generatedAt ? (timeAgo(overview.generatedAt) ?? "?") : "?";
      console.log(chalk.bold(`${org.name} — overview`));
      console.log(
        chalk.dim(`  generated ${ageLabel} · ${overview.releaseCount} releases contributing`),
      );
      console.log();
      console.log(overview.content);
    });
}
