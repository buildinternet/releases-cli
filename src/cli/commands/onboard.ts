import { Command } from "commander";
import chalk from "chalk";

/**
 * `releases admin discovery onboard` used to start a remote Managed-Agents
 * discovery session through `POST /v1/workflows/discover`. That route and the
 * discovery worker were retired (buildinternet/releases#2352). The command
 * stays for one release window so old habits and scripts get a pointer instead
 * of an unexplained 404.
 */
export function registerOnboardCommand(program: Command) {
  program
    .command("onboard")
    .description(
      "Retired. Onboard sources with the admin create commands or the local-ingest skill",
    )
    .argument("[company]", "Ignored")
    .allowUnknownOption()
    .allowExcessArguments()
    .action(() => {
      console.error(chalk.yellow("Remote onboarding sessions were retired."));
      console.error("");
      console.error("Onboard an organization and its sources directly:");
      console.error(`  ${chalk.cyan("releases admin org create <name> --domain <domain>")}`);
      console.error(`  ${chalk.cyan("releases admin source create --org <org> --url <url>")}`);
      console.error("");
      console.error(
        "Or let an agent do the discovery: the `local-ingest` skill in the releases monorepo",
      );
      console.error(
        "fetches, extracts, and writes releases through the batch API without a remote session.",
      );
      console.error("Vendors can also declare sources themselves with a `releases.json` manifest.");
      process.exitCode = 1;
    });
}
