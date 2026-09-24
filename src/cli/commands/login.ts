import { hostname } from "node:os";
import { join } from "node:path";
import type { Command } from "commander";
import chalk from "chalk";
import type { UserApiKey } from "@buildinternet/releases-api-types";
import { getDataDir } from "@releases/lib/config";
import { getApiUrl } from "../../lib/mode.js";
import {
  writeCredential as writeCredentialToDisk,
  readCredential as readCredentialFromDisk,
  type StoredCredential,
} from "../../lib/credentials.js";
import { openBrowser } from "../../lib/open-browser.js";
import {
  runDeviceAuth,
  createUserApiKey,
  listUserApiKeys,
  revokeUserApiKey,
  ApiKeyLimitError,
  type CreatedKey,
} from "../../lib/device-auth.js";
import { promptConfirm, defaultPromptReader, type PromptReader } from "../../lib/confirm.js";

/** Prefix `releases login` gives every key it mints (`releases-cli (<host>)`). */
const CLI_KEY_NAME_PREFIX = "releases-cli (";

function isCliKeyName(name: string | null): boolean {
  return typeof name === "string" && name.startsWith(CLI_KEY_NAME_PREFIX);
}

export interface LoginFlowDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  openBrowser?: (url: string) => boolean;
  print?: (line: string) => void;
  promptReader?: PromptReader;
  readCredential?: () => StoredCredential | null;
  writeCredential?: (cred: StoredCredential) => void;
}

export interface LoginFlowArgs {
  apiUrl: string;
  openInBrowser: boolean;
  /** Name recorded on the minted key (defaults to `releases-cli (<hostname>)`). */
  keyName: string;
  deps?: LoginFlowDeps;
}

/** Print how many active keys the user has, the CLI ones oldest-first with
 * last-used, and the exact commands to free one up by hand. */
function printCapGuidance(keys: UserApiKey[] | null, print: (line: string) => void): void {
  if (!keys) {
    print(chalk.dim("List your keys:  releases keys list"));
    print(chalk.dim("Revoke one:      releases keys revoke <id>"));
    return;
  }
  const cliKeys = keys
    .filter((k) => isCliKeyName(k.name))
    .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt));

  print(chalk.dim(`You have ${keys.length} active API key(s).`));
  if (cliKeys.length > 0) {
    print(chalk.dim("CLI keys, oldest first:"));
    for (const k of cliKeys) {
      const lastUsed = k.lastRequest ? `last used ${k.lastRequest.slice(0, 10)}` : "never used";
      print(chalk.dim(`  ${k.id}  ${k.name}  created ${k.createdAt.slice(0, 10)}  (${lastUsed})`));
    }
  }
  print(chalk.dim("List all keys:  releases keys list"));
  print(chalk.dim("Revoke one:     releases keys revoke <id>"));
}

/**
 * Mint a fresh key. On the server's 409 active-key-limit response, don't just
 * fail: print guidance (how many keys, which ones, how to revoke by hand),
 * and — only when stdin is a real TTY — offer to revoke the oldest
 * never-used `releases-cli (…)` key and retry the mint once. A non-TTY
 * caller (piped stdin, CI) gets the guidance and the original error.
 */
async function mintKeyWithCapHandling(
  apiUrl: string,
  sessionToken: string,
  keyName: string,
  print: (line: string) => void,
  promptReader: PromptReader,
  fetchImpl?: typeof fetch,
): Promise<CreatedKey> {
  try {
    return await createUserApiKey(apiUrl, sessionToken, keyName, fetchImpl);
  } catch (err) {
    if (!(err instanceof ApiKeyLimitError)) throw err;

    let keys: UserApiKey[] | null = null;
    try {
      keys = await listUserApiKeys(apiUrl, sessionToken, fetchImpl);
    } catch (listErr) {
      print(chalk.dim(`Could not list your keys: ${(listErr as Error).message}`));
    }
    printCapGuidance(keys, print);

    const oldestUnused = keys
      ?.filter((k) => isCliKeyName(k.name) && !k.lastRequest)
      .toSorted((a, b) => a.createdAt.localeCompare(b.createdAt))[0];

    // promptConfirm's default reader refuses a non-TTY stdin (returns null,
    // i.e. never confirmed) — this doubles as the non-interactive guard.
    if (!oldestUnused) throw err;
    const confirmed = await promptConfirm(
      `Revoke the oldest unused CLI key to make room? Type its id to confirm (${oldestUnused.id}): `,
      oldestUnused.id,
      promptReader,
    );
    if (!confirmed) throw err;

    await revokeUserApiKey(apiUrl, sessionToken, oldestUnused.id, fetchImpl);
    print(chalk.dim(`Revoked ${oldestUnused.id} to make room.`));

    return await createUserApiKey(apiUrl, sessionToken, keyName, fetchImpl);
  }
}

/**
 * Orchestrate `releases login`: device-authorize, mint a fresh read key
 * (walking the server's active-key cap if needed), persist the credential,
 * then revoke whatever key the PREVIOUS credential for this same apiUrl
 * pointed at — only now that the new one is safely minted and stored, so a
 * failed login never leaves the user keyless. Revocation is best-effort: a
 * failure prints a dim warning and never fails the login. A legacy
 * credential with no `keyId` (predates this fix, or was set via `auth
 * login`) is left alone rather than guessed at by name or `start` prefix.
 */
export async function runLoginFlow(args: LoginFlowArgs): Promise<StoredCredential> {
  const print = args.deps?.print ?? ((l: string) => console.log(l));
  const promptReader = args.deps?.promptReader ?? defaultPromptReader;
  const readCredential = args.deps?.readCredential ?? readCredentialFromDisk;
  const writeCredential = args.deps?.writeCredential ?? writeCredentialToDisk;
  const fetchImpl = args.deps?.fetchImpl;

  const previous = readCredential();

  const { sessionToken } = await runDeviceAuth({
    apiUrl: args.apiUrl,
    openInBrowser: args.openInBrowser,
    deps: {
      fetchImpl,
      sleep: args.deps?.sleep,
      openBrowser: args.deps?.openBrowser,
      print,
    },
  });

  const created = await mintKeyWithCapHandling(
    args.apiUrl,
    sessionToken,
    args.keyName,
    print,
    promptReader,
    fetchImpl,
  );

  const cred: StoredCredential = {
    token: created.key,
    keyId: created.id,
    sessionToken,
    name: created.name ?? args.keyName,
    scopes: [created.scope ?? "read"],
    apiUrl: args.apiUrl,
    savedAt: new Date().toISOString(),
  };
  writeCredential(cred);

  print(`${chalk.green("Signed in")} ${chalk.dim(`(scopes: ${(cred.scopes ?? []).join(", ")})`)}`);
  print(chalk.dim(`  Saved to ${join(getDataDir(), "credentials")}`));

  // Only now that the new key is minted AND stored — never before — drop the
  // key the previous credential (for this same environment) pointed at.
  if (
    previous &&
    previous.apiUrl === args.apiUrl &&
    previous.keyId &&
    previous.keyId !== created.id
  ) {
    try {
      await revokeUserApiKey(args.apiUrl, sessionToken, previous.keyId, fetchImpl);
      print(chalk.dim(`  Revoked previous key ${previous.keyId}.`));
    } catch (err) {
      print(
        chalk.dim(
          `  Could not revoke the previous key (${previous.keyId}): ${(err as Error).message}`,
        ),
      );
    }
  }

  return cred;
}

export function registerLoginCommand(program: Command): void {
  program
    .command("login")
    .description("Sign in via your browser and store a read-only API key (device authorization)")
    .option("--no-browser", "Print the URL instead of opening a browser")
    .action(async (opts: { browser?: boolean }) => {
      const apiUrl = getApiUrl();
      try {
        await runLoginFlow({
          apiUrl,
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
