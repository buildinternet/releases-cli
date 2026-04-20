import { Command } from "commander";
import chalk from "chalk";
import { findOrg, getPlaybook, updatePlaybookNotes } from "../../../api/client.js";
import { orgNotFound } from "../../suggest.js";
import { writeJson } from "../../../lib/output.js";
import { timeAgo } from "@buildinternet/releases-core/dates";

interface PlaybookOpts {
  json?: boolean;
  notes?: string;
}

export function registerPlaybookCommand(program: Command) {
  program
    .command("playbook")
    .description("Read or update an organization's playbook")
    .argument("<org>", "Organization slug or ID")
    .option("--json", "Output as JSON")
    .option("--notes <text>", "Replace agent notes (pass full notes content; empty string clears)")
    .addHelpText(
      "after",
      `
Examples:
  releases admin playbook vercel
  releases admin playbook vercel --json
  releases admin playbook vercel --notes "### Fetch instructions\\n..."

The playbook's header (source list, products) regenerates automatically after
any source add/edit/remove — no manual regenerate step is needed. The PATCH
run by --notes also seeds a fresh header on first write.`,
    )
    .action(async (orgIdentifier: string, opts: PlaybookOpts) => {
      const org = await findOrg(orgIdentifier);
      if (!org) return orgNotFound(orgIdentifier);

      if (opts.notes !== undefined) {
        await updatePlaybookNotes(org.slug, opts.notes);
        if (opts.json) {
          await writeJson({ org: org.slug, notesUpdated: true });
        } else {
          console.log(chalk.green(`Notes updated for ${org.name} playbook.`));
        }
        return;
      }

      const playbook = await getPlaybook(org.slug);

      if (!playbook) {
        if (opts.json) {
          await writeJson({ org: org.slug, playbook: null });
        } else {
          console.log(chalk.yellow(`No playbook available for ${org.name}.`));
        }
        return;
      }

      if (opts.json) {
        await writeJson({
          org: org.slug,
          content: playbook.content,
          notes: playbook.notes ?? null,
          releaseCount: playbook.releaseCount,
          generatedAt: playbook.generatedAt,
          updatedAt: playbook.updatedAt,
        });
        return;
      }

      const ageLabel = playbook.generatedAt ? (timeAgo(playbook.generatedAt) ?? "?") : "?";
      console.log(chalk.bold(`${org.name} — playbook`));
      console.log(chalk.dim(`  generated ${ageLabel} · ${playbook.releaseCount} sources`));
      console.log();
      console.log(playbook.content);
      if (playbook.notes) {
        console.log();
        console.log(chalk.dim("─── Agent notes ───"));
        console.log(playbook.notes);
      }
    });
}
