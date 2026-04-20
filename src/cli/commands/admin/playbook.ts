import { Command } from "commander";
import chalk from "chalk";
import { logger } from "@releases/lib/logger";
import { getPlaybook, updatePlaybookNotes } from "../../../api/client.js";
import { stripAnsi } from "../../../lib/sanitize.js";
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
    .option("--notes <text>", "Replace agent notes (pass full notes content)")
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
      if (opts.notes !== undefined) {
        try {
          await updatePlaybookNotes(orgIdentifier, opts.notes);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`Failed to update playbook notes: ${msg}`);
          process.exit(1);
        }
        if (opts.json) {
          await writeJson({ org: orgIdentifier, notesUpdated: true });
        } else {
          console.log(chalk.green(`Notes updated for ${orgIdentifier} playbook.`));
        }
        return;
      }

      const playbook = await getPlaybook(orgIdentifier).catch(() => null);

      if (!playbook) {
        if (opts.json) {
          await writeJson({ org: orgIdentifier, playbook: null });
        } else {
          console.log(
            chalk.yellow(
              `No playbook available for ${orgIdentifier}. ` +
                `A playbook is auto-created on the first source add/edit/remove, ` +
                `or when you attach notes with --notes.`,
            ),
          );
        }
        return;
      }

      if (opts.json) {
        await writeJson({
          org: orgIdentifier,
          content: playbook.content,
          notes: playbook.notes ?? null,
          releaseCount: playbook.releaseCount,
          generatedAt: playbook.generatedAt,
          updatedAt: playbook.updatedAt,
        });
        return;
      }

      const ageLabel = playbook.generatedAt ? (timeAgo(playbook.generatedAt) ?? "?") : "?";
      console.log(chalk.bold(`${orgIdentifier} — playbook`));
      console.log(chalk.dim(`  generated ${ageLabel} · ${playbook.releaseCount} sources`));
      console.log();
      console.log(stripAnsi(playbook.content));
      if (playbook.notes) {
        console.log();
        console.log(chalk.dim("─── Agent notes ───"));
        console.log(stripAnsi(playbook.notes));
      }
    });
}
