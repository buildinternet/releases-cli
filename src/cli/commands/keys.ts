import { Command } from "commander";
import chalk from "chalk";
import type {
  UserApiKey,
  CreatedUserApiKey,
  ListUserApiKeysResponse,
} from "@buildinternet/releases-api-types";
import { getApiUrl } from "../../lib/mode.js";
import { getSessionToken, clearSessionToken } from "../../lib/session.js";
import { writeJson } from "../../lib/output.js";
import { renderTable } from "../render/table.js";
import { promptConfirm, defaultPromptReader } from "../../lib/confirm.js";

const UA = "releases-cli";

export interface KeysRequestDeps {
  getToken: (apiUrl: string) => Promise<string>;
  onReauth: (apiUrl: string) => Promise<string>;
  fetchImpl?: typeof fetch;
}

/**
 * Session-authed request to the /v1/api-keys management surface. Sends the
 * stored session token as a Bearer credential; on a 401 it re-auths ONCE
 * (forcing the device flow) and retries, then surfaces whatever comes back.
 */
export async function keysRequest(
  apiUrl: string,
  path: string,
  init: RequestInit,
  deps: KeysRequestDeps,
): Promise<Response> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const send = (t: string) =>
    fetchImpl(`${apiUrl}${path}`, {
      ...init,
      headers: { ...init.headers, authorization: `Bearer ${t}`, "user-agent": UA },
    });

  let res = await send(await deps.getToken(apiUrl));
  if (res.status === 401) {
    res = await send(await deps.onReauth(apiUrl));
  }
  return res;
}

/** Production deps: stored token, and a re-auth that clears the stale one first. */
function liveDeps(): KeysRequestDeps {
  return {
    getToken: (apiUrl) => getSessionToken(apiUrl),
    onReauth: async (apiUrl) => {
      clearSessionToken();
      return getSessionToken(apiUrl);
    },
  };
}

async function errMessage(res: Response, fallback: string): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string };
    return body.message || fallback;
  } catch {
    return fallback;
  }
}

export function registerKeysCommand(program: Command): void {
  const keys = program
    .command("keys")
    .description("Manage your user API keys (read-only relu_ keys)");

  keys
    .command("create")
    .description("Create a read-only API key (revealed once)")
    .requiredOption("--name <name>", "Label for the key")
    .option("--expires-in-days <n>", "Expiry in days (1-365)", (v) => parseInt(v, 10))
    .option("--json", "Output as JSON")
    .action(async (opts: { name: string; expiresInDays?: number; json?: boolean }) => {
      const apiUrl = getApiUrl();
      const body: Record<string, unknown> = { name: opts.name, scope: "read" };
      if (opts.expiresInDays !== undefined) body.expiresInDays = opts.expiresInDays;
      const res = await keysRequest(
        apiUrl,
        "/v1/api-keys",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        },
        liveDeps(),
      );
      if (!res.ok) {
        console.error(
          chalk.red(await errMessage(res, `Failed to create key (HTTP ${res.status})`)),
        );
        process.exit(1);
      }
      const created = (await res.json()) as CreatedUserApiKey;
      if (opts.json) {
        await writeJson(created);
        return;
      }
      console.log(
        chalk.green("API key created (read-only). Store it now — it won't be shown again:"),
      );
      console.log(`\n  ${chalk.bold(created.key)}\n`);
      console.log(chalk.dim(`  id: ${created.id}  scope: ${created.scope}`));
    });

  keys
    .command("list")
    .description("List your API keys")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const apiUrl = getApiUrl();
      const res = await keysRequest(apiUrl, "/v1/api-keys", { method: "GET" }, liveDeps());
      if (!res.ok) {
        console.error(chalk.red(await errMessage(res, `Failed to list keys (HTTP ${res.status})`)));
        process.exit(1);
      }
      const data = (await res.json()) as ListUserApiKeysResponse;
      if (opts.json) {
        await writeJson(data);
        return;
      }
      if (data.apiKeys.length === 0) {
        console.log(
          chalk.yellow("No API keys. Create one with `releases keys create --name <name>`."),
        );
        return;
      }
      console.log(
        renderTable({
          head: [
            { label: "ID", noTruncate: true },
            { label: "Name" },
            { label: "Scope", noTruncate: true },
            { label: "Prefix", noTruncate: true },
            { label: "Created", noTruncate: true },
            { label: "Expires", noTruncate: true },
          ],
          rows: data.apiKeys.map((k: UserApiKey) => [
            k.id,
            k.name ?? chalk.dim("—"),
            k.scope ?? chalk.dim("—"),
            k.start ?? chalk.dim("—"),
            k.createdAt.slice(0, 10),
            k.expiresAt ? k.expiresAt.slice(0, 10) : chalk.dim("never"),
          ]),
        }),
      );
    });

  keys
    .command("revoke <id>")
    .description("Revoke (delete) an API key by id")
    .option("--yes", "Skip the confirmation prompt")
    .action(async (id: string, opts: { yes?: boolean }) => {
      if (!opts.yes) {
        const ok = await promptConfirm(
          `Type the key id to confirm revoke (${id}): `,
          id,
          defaultPromptReader,
        );
        if (!ok) {
          console.error(chalk.red("Aborted."));
          process.exit(1);
        }
      }
      const apiUrl = getApiUrl();
      const res = await keysRequest(
        apiUrl,
        `/v1/api-keys/${encodeURIComponent(id)}`,
        { method: "DELETE" },
        liveDeps(),
      );
      if (res.status === 404) {
        console.error(chalk.red("No such key (or not owned by you)."));
        process.exit(1);
      }
      if (!res.ok) {
        console.error(
          chalk.red(await errMessage(res, `Failed to revoke key (HTTP ${res.status})`)),
        );
        process.exit(1);
      }
      console.log(chalk.green(`Revoked ${id}.`));
    });
}
