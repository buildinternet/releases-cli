import { Command } from "commander";
import chalk from "chalk";
import { findOrg, getOverviewInputs } from "../../../../api/client.js";
import { orgNotFound } from "../../../suggest.js";
import { writeJson } from "../../../../lib/output.js";
import { parsePositiveIntFlag } from "../../../../lib/flags.js";

interface OverviewInputsOpts {
  json?: boolean;
  window?: string;
  limit?: string;
}

export function registerOverviewInputsCommand(program: Command) {
  program
    .command("overview-inputs")
    .description("Build the input payload for an overview regeneration")
    .argument("<org>", "Organization slug or ID")
    .option("--window <days>", "Lookback window in days (default 90)")
    .option("--limit <n>", "Max releases to include (default 50)")
    .option("--json", "Output as JSON (recommended for agent consumption)")
    .addHelpText(
      "after",
      `
Examples:
  releases admin overview-inputs vercel --json
  releases admin overview-inputs vercel --window 30 --json

Returns the org, active sources, prior overview content, and the post-selection
slice of recent releases. Selection is server-side and deterministic (per-source
caps, sorted desc by publishedAt, capped at --limit). Feed the JSON to the
generator described in the \`regenerating-overviews\` skill, then post the
result with \`releases admin overview-write\`.`,
    )
    .action(async (orgIdentifier: string, opts: OverviewInputsOpts) => {
      const org = await findOrg(orgIdentifier);
      if (!org) return orgNotFound(orgIdentifier);

      const window = parsePositiveIntFlag("window", opts.window);
      const limit = parsePositiveIntFlag("limit", opts.limit);
      const inputs = await getOverviewInputs(org.slug, { window, limit });

      if (opts.json) {
        await writeJson(inputs);
        return;
      }

      console.log(chalk.bold(`${inputs.org.name} — overview inputs`));
      console.log(
        chalk.dim(
          `  window: ${inputs.windowDays}d · sources: ${inputs.sources.length} · selected: ${inputs.selected.length} of ${inputs.totalAvailable}`,
        ),
      );
      console.log();
      if (inputs.existingContent) {
        console.log(chalk.dim("Existing overview present (will be passed for amend-and-evolve)."));
      } else {
        console.log(chalk.dim("No existing overview — first generation."));
      }
      if (inputs.selected.length === 0) {
        console.log();
        console.log(chalk.yellow("No releases in window. Skip generation; nothing to write."));
        return;
      }
      console.log();
      console.log(chalk.dim("Selected releases (most recent first):"));
      for (const r of inputs.selected.slice(0, 10)) {
        const v = r.version ? ` ${r.version}` : "";
        const t = r.title ? ` — ${r.title}` : "";
        console.log(`  ${r.publishedAt ?? "—"}${v}${t}`);
      }
      if (inputs.selected.length > 10) {
        console.log(
          chalk.dim(`  … ${inputs.selected.length - 10} more (use --json for full list)`),
        );
      }
    });
}
