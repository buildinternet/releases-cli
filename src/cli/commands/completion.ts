import { Command } from "commander";
import chalk from "chalk";
import { commandToSpec, generateCompletion, type SupportedShell } from "../completion/generate.js";
import {
  defaultInstallPath,
  detectShell,
  rcSnippet,
  writeCompletionFile,
} from "../completion/install.js";
import { markCompletionHintShown } from "../completion/hint.js";

const SHELLS: SupportedShell[] = ["bash", "zsh", "fish"];

function parseShell(raw: string | undefined): SupportedShell {
  if (!raw) {
    console.error(
      chalk.red("Missing shell argument.") +
        " " +
        chalk.dim("Usage: releases completion <bash|zsh|fish>"),
    );
    process.exit(1);
  }
  if (!SHELLS.includes(raw as SupportedShell)) {
    console.error(
      chalk.red(`Unsupported shell: ${raw}`) + " " + chalk.dim("Supported: bash, zsh, fish"),
    );
    process.exit(1);
  }
  return raw as SupportedShell;
}

export function registerCompletionCommand(parent: Command): void {
  const completion = parent
    .command("completion")
    .description("Print or install shell completions")
    .showSuggestionAfterError(true);

  for (const shell of SHELLS) {
    completion
      .command(shell)
      .description(`Print the ${shell} completion script to stdout`)
      .action(() => {
        const spec = commandToSpec(parent);
        process.stdout.write(generateCompletion(shell, spec));
      });
  }

  completion
    .command("install")
    .argument("[shell]", "Shell to install for (auto-detected if omitted)")
    .option("--path <path>", "Override the install path (defaults vary by shell)")
    .description("Detect your shell and write the completion script")
    .action((shellArg: string | undefined, opts: { path?: string }) => {
      const shell = shellArg ? parseShell(shellArg) : detectShell();
      if (!shell) {
        console.error(
          chalk.red("Could not detect shell.") +
            " " +
            chalk.dim("Pass one explicitly: releases completion install <bash|zsh|fish>"),
        );
        process.exit(1);
      }

      const path = opts.path ?? defaultInstallPath(shell);
      const spec = commandToSpec(parent);
      const content = generateCompletion(shell, spec);
      const result = writeCompletionFile(path, content);
      markCompletionHintShown();

      const verb = result.alreadyExisted ? "Updated" : "Installed";
      console.log(`${chalk.green("✓")} ${verb} ${shell} completion at ${chalk.bold(path)}`);
      console.log("");
      console.log(chalk.dim(rcSnippet(shell, path)));
    });
}
