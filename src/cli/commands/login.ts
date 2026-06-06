import { hostname } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { getDataDir } from "@releases/lib/config";
import { getApiUrl } from "../../lib/mode.js";
import { writeCredential, type StoredCredential } from "../../lib/credentials.js";
import { openBrowser } from "../../lib/open-browser.js";
import { runDeviceLogin } from "../../lib/device-auth.js";

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in via your browser and store a read-only API key (device authorization)")
    .option("--no-browser", "Print the URL instead of opening a browser")
    .action(async (opts: { browser?: boolean }) => {
      const apiUrl = getApiUrl();

      try {
        const result = await runDeviceLogin({
          apiUrl,
          openInBrowser: opts.browser !== false,
          deps: {
            openBrowser,
            keyName: `releases-cli (${hostname()})`,
            print: (line) => console.log(line),
          },
        });

        const cred: StoredCredential = {
          token: result.token,
          sessionToken: result.sessionToken,
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
