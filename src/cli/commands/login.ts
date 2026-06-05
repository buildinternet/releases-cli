import { hostname } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { getDataDir } from "@releases/lib/config";
import { getApiUrl } from "../../lib/mode.js";
import { writeCredential, type StoredCredential } from "../../lib/credentials.js";
import { openBrowser } from "../../lib/open-browser.js";
import { runDeviceLogin, type UserScope } from "../../lib/device-auth.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in via your browser and store an API key (device authorization)")
    .option("--scope <scope>", "Requested scope: read or write", "write")
    .option("--no-browser", "Print the URL instead of opening a browser")
    .action(async (opts: { scope?: string; browser?: boolean }) => {
      const scope: UserScope = opts.scope === "read" ? "read" : "write";
      const apiUrl = getApiUrl();

      try {
        const result = await runDeviceLogin({
          apiUrl,
          scope,
          openInBrowser: opts.browser !== false,
          deps: {
            openBrowser,
            keyName: `releases-cli (${hostname()})`,
            print: (line) => console.log(line),
          },
        });

        const cred: StoredCredential = {
          token: result.token,
          name: result.name,
          scopes: result.scopes,
          apiUrl: result.apiUrl,
          savedAt: new Date().toISOString(),
        };
        writeCredential(cred);

        console.log(
          `${chalk.green("Signed in")} ${chalk.dim(
            `(scopes: ${(result.scopes ?? []).join(", ")})`,
          )}`,
        );
        console.log(chalk.dim(`  Saved to ${join(getDataDir(), "credentials")}`));
      } catch (err) {
        console.error(chalk.red((err as Error).message));
        process.exit(1);
      }
    });
}
