import { hostname } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import { getDataDir } from "@releases/lib/config";
import { getApiUrl } from "../../lib/mode.js";
import {
  writeCredential as writeCredentialToDisk,
  readCredential as readCredentialFromDisk,
  type StoredCredential,
} from "../../lib/credentials.js";
import { openBrowser } from "../../lib/open-browser.js";
import { runDeviceLogin, revokeKeyQuietly, type DeviceLoginDeps } from "../../lib/device-auth.js";

export interface LoginFlowDeps extends Omit<DeviceLoginDeps, "keyName"> {
  readCredential?: () => StoredCredential | null;
  writeCredential?: (cred: StoredCredential) => void;
}

export interface LoginFlowArgs {
  apiUrl: string;
  openInBrowser: boolean;
  /** Name recorded on the minted key (`releases-cli (<hostname>)`). */
  keyName: string;
  deps?: LoginFlowDeps;
}

/**
 * `releases login`: device-authorize and mint a fresh read key, persist it,
 * then revoke the key the PREVIOUS credential for this same apiUrl pointed at.
 * The revoke runs only after the new key is minted and stored, so a failed
 * login never leaves the user keyless, and it's best-effort: a failure prints
 * a dim note and never fails the login. A credential with no `keyId` (saved
 * before #418, or via `auth login`) is left alone rather than guessed at.
 */
export async function runLoginFlow(args: LoginFlowArgs): Promise<StoredCredential> {
  const { readCredential = readCredentialFromDisk, writeCredential = writeCredentialToDisk } =
    args.deps ?? {};
  const print = args.deps?.print ?? ((l: string) => console.log(l));

  const previous = readCredential();
  const res = await runDeviceLogin({
    apiUrl: args.apiUrl,
    openInBrowser: args.openInBrowser,
    deps: { ...args.deps, print, keyName: args.keyName },
  });

  const cred: StoredCredential = {
    token: res.token,
    keyId: res.id,
    sessionToken: res.sessionToken,
    name: res.name,
    scopes: res.scopes,
    apiUrl: args.apiUrl,
    savedAt: new Date().toISOString(),
  };
  writeCredential(cred);

  print(`${chalk.green("Signed in")} ${chalk.dim(`(scopes: ${(cred.scopes ?? []).join(", ")})`)}`);
  print(chalk.dim(`  Saved to ${join(getDataDir(), "credentials")}`));

  const replaced = previous?.apiUrl === args.apiUrl ? previous.keyId : undefined;
  if (replaced && replaced !== res.id) {
    const failure = await revokeKeyQuietly(
      args.apiUrl,
      res.sessionToken,
      replaced,
      args.deps?.fetchImpl,
    );
    print(
      chalk.dim(
        failure
          ? `  Could not revoke the previous key (${replaced}): ${failure}`
          : `  Revoked previous key ${replaced}.`,
      ),
    );
  }

  return cred;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in via your browser and store a read-only API key (device authorization)")
    .option("--no-browser", "Print the URL instead of opening a browser")
    .action(async (opts: { browser?: boolean }) => {
      try {
        await runLoginFlow({
          apiUrl: getApiUrl(),
          openInBrowser: opts.browser !== false,
          keyName: `releases-cli (${hostname()})`,
          deps: { openBrowser },
        });
      } catch (err) {
        console.error(chalk.red((err as Error).message));
        process.exit(1);
      }
    });
}
