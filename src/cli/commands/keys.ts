import { Command, InvalidArgumentError } from "commander";
import chalk from "chalk";
import type {
  UserApiKey,
  CreatedUserApiKey,
  ListUserApiKeysResponse,
} from "@buildinternet/releases-api-types";
import { getApiUrl } from "../../lib/mode.js";
import { getSessionToken, clearSessionToken } from "../../lib/session.js";
import { newIdempotencyKey } from "../../lib/idempotency.js";
import { ApiError } from "../../lib/errors.js";
import { apiFetch } from "../../api/core.js";
import { writeJson } from "../../lib/output.js";
import { markDryRun } from "../../lib/dry-run.js";
import { logger } from "@releases/lib/logger";
import { renderTable } from "../render/table.js";
import { promptConfirm, defaultPromptReader } from "../../lib/confirm.js";

/**
 * Strict parser for `--expires-in-days`. `parseInt("abc")` yields NaN (which
 * would serialize to `null`) and `parseInt("3d")` silently yields 3 — so parse
 * with `Number`, require a whole number in 1–365, and reject anything else with
 * a commander argument error rather than letting a bad value reach the server.
 */
export function parseExpiresInDays(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 365) {
    throw new InvalidArgumentError("must be an integer between 1 and 365.");
  }
  return n;
}

export interface KeysRequestDeps {
  getToken: (apiUrl: string) => Promise<string>;
  onReauth: (apiUrl: string) => Promise<string>;
}

/**
 * Session-authed request to the /v1/api-keys management surface, routed
 * through the shared `apiFetch` transport. Sends the stored session token as
 * a Bearer credential — `skipDefaultAuth` stops `apiFetch` from overwriting
 * it with the static admin/API key when one happens to be configured too —
 * and on a 401 re-auths ONCE (forcing the device flow) and retries, then
 * surfaces whatever comes back (or throws, on a non-401 failure).
 */
export async function keysRequest<T>(
  apiUrl: string,
  path: string,
  init: RequestInit,
  deps: KeysRequestDeps,
): Promise<T> {
  // One key per logical call, generated up front so the 401 reauth retry
  // below resends it unchanged — a mint that's retried after a stale session
  // token replays the first attempt's response instead of minting twice.
  const idempotencyKey = init.method === "POST" ? newIdempotencyKey() : undefined;
  const attempt = (token: string) =>
    apiFetch<T>(path, {
      ...init,
      headers: {
        ...init.headers,
        authorization: `Bearer ${token}`,
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      skipDefaultAuth: true,
    });

  try {
    return await attempt(await deps.getToken(apiUrl));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      return await attempt(await deps.onReauth(apiUrl));
    }
    throw err;
  }
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

/** apiFetch/ApiError already resolve the standardized error envelope (and the
 * 409 idempotency-conflict message) into a clean human message — surface
 * that directly rather than re-deriving it. */
function keysErrorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.serverMessage;
  return err instanceof Error ? err.message : String(err);
}

export function registerKeysCommand(program: Command): void {
  const keys = program
    .command("keys")
    .description("Manage your user API keys (read-only relu_ keys)");

  keys
    .command("create")
    .description("Create a read-only API key (revealed once)")
    .requiredOption("--name <name>", "Label for the key")
    .option("--expires-in-days <n>", "Expiry in days (1-365)", parseExpiresInDays)
    .option("--json", "Output as JSON")
    .option("--dry-run", "Show what would be created without minting a key")
    .action(
      async (opts: { name: string; expiresInDays?: number; json?: boolean; dryRun?: boolean }) => {
        const apiUrl = getApiUrl();
        const body: Record<string, unknown> = { name: opts.name, scope: "read" };
        // parseExpiresInDays guarantees a valid integer or commander exits before
        // this runs; the Number.isInteger guard is belt-and-suspenders so a NaN/null
        // can never be serialized into the request body.
        if (opts.expiresInDays !== undefined && Number.isInteger(opts.expiresInDays)) {
          body.expiresInDays = opts.expiresInDays;
        }
        if (opts.dryRun) {
          if (opts.json) {
            await writeJson(markDryRun({ wouldCreate: body }));
            return;
          }
          const expiresHint =
            opts.expiresInDays !== undefined ? ` (expires in ${opts.expiresInDays}d)` : "";
          logger.warn(`[dry-run] Would create read-only API key "${opts.name}"${expiresHint}.`);
          return;
        }
        let created: CreatedUserApiKey;
        try {
          created = await keysRequest<CreatedUserApiKey>(
            apiUrl,
            "/v1/api-keys",
            { method: "POST", body: JSON.stringify(body) },
            liveDeps(),
          );
        } catch (err) {
          console.error(chalk.red(keysErrorMessage(err)));
          process.exit(1);
        }
        if (opts.json) {
          await writeJson(created);
          return;
        }
        console.log(
          chalk.green("API key created (read-only). Store it now — it won't be shown again:"),
        );
        console.log(`\n  ${chalk.bold(created.key)}\n`);
        console.log(chalk.dim(`  id: ${created.id}  scope: ${created.scope}`));
      },
    );

  keys
    .command("list")
    .description("List your API keys")
    .option("--json", "Output as JSON")
    .action(async (opts: { json?: boolean }) => {
      const apiUrl = getApiUrl();
      let data: ListUserApiKeysResponse | null;
      try {
        data = await keysRequest<ListUserApiKeysResponse | null>(
          apiUrl,
          "/v1/api-keys",
          { method: "GET" },
          liveDeps(),
        );
      } catch (err) {
        console.error(chalk.red(keysErrorMessage(err)));
        process.exit(1);
      }
      if (!data) {
        console.error(chalk.red("Failed to list keys (HTTP 404)"));
        process.exit(1);
      }
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
    .option("--dry-run", "Show what would be revoked without deleting")
    .action(async (id: string, opts: { yes?: boolean; dryRun?: boolean }) => {
      if (opts.dryRun) {
        logger.warn(`[dry-run] Would revoke API key ${id}.`);
        return;
      }
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
      try {
        await keysRequest(
          apiUrl,
          `/v1/api-keys/${encodeURIComponent(id)}`,
          { method: "DELETE" },
          liveDeps(),
        );
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) {
          console.error(chalk.red("No such key (or not owned by you)."));
          process.exit(1);
        }
        console.error(chalk.red(keysErrorMessage(err)));
        process.exit(1);
      }
      console.log(chalk.green(`Revoked ${id}.`));
    });
}
