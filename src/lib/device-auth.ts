/**
 * RFC 8628 device-authorization client for `releases login`. Plain `fetch`
 * against the API worker's Better Auth handler — no `better-auth` dependency, so
 * the thin client stays thin. The flow: request a device+user code, have the
 * human approve it in a browser, poll for a session access token, then exchange
 * that session for a durable `relu_` API key and hand it back to the caller to
 * store. User keys are READ-ONLY: the server caps the relu_ lane at read
 * (USER_API_KEY_MAX_SCOPE), so there is no scope choice here — login mints a
 * read key that can search and read the catalog but not modify it.
 */

import type { UserApiKey, ListUserApiKeysResponse } from "@buildinternet/releases-api-types";

// Must match DEVICE_AUTH_CLIENT_ID in @buildinternet/releases-core/api-token — the
// worker's validateClient allow-list rejects any other client_id (fail closed).
// Hard-coded until a published core version exposing that constant is adopted; keep
// the literal in lockstep until then.
const CLIENT_ID = "releases-cli";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_uri: string;
  verification_uri_complete?: string;
  expires_in: number;
  interval?: number;
}

export async function requestDeviceCode(
  apiUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceCodeResponse> {
  const res = await fetchImpl(`${apiUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": CLIENT_ID },
    // No OAuth scope on the device-grant request: the minted key's scope is fixed
    // read-only server-side, so there is nothing to request here.
    body: JSON.stringify({ client_id: CLIENT_ID }),
  });
  if (!res.ok) {
    throw new Error(`Could not start device login (HTTP ${res.status}).`);
  }
  return (await res.json()) as DeviceCodeResponse;
}

export interface PollOptions {
  intervalSeconds: number;
  expiresInSeconds: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Poll the token endpoint until approval, denial, or expiry. Returns the access token. */
export async function pollForToken(
  apiUrl: string,
  deviceCode: string,
  opts: PollOptions,
): Promise<string> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  let interval = Math.max(0, opts.intervalSeconds);
  const deadline = Date.now() + opts.expiresInSeconds * 1000;

  for (;;) {
    if (Date.now() > deadline) {
      throw new Error("Device code expired before it was approved. Run `releases login` again.");
    }
    // oxlint-disable-next-line no-await-in-loop -- sequential device-flow poll (RFC 8628): wait the server interval before each request
    await sleep(interval * 1000);

    // oxlint-disable-next-line no-await-in-loop -- sequential device-flow poll (RFC 8628): one outstanding poll request at a time
    const res = await fetchImpl(`${apiUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": CLIENT_ID },
      body: JSON.stringify({
        grant_type: GRANT_TYPE,
        device_code: deviceCode,
        client_id: CLIENT_ID,
      }),
    });
    // oxlint-disable-next-line no-await-in-loop -- sequential device-flow poll (RFC 8628): parse this poll's response before the next iteration
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };

    if (data.access_token) return data.access_token;

    switch (data.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        interval += 5;
        continue;
      case "access_denied":
        throw new Error("Authorization was denied in the browser.");
      case "expired_token":
        throw new Error("Device code expired before it was approved. Run `releases login` again.");
      default:
        throw new Error(
          `Device login failed: ${data.error_description ?? data.error ?? "unknown error"}`,
        );
    }
  }
}

export interface SessionUser {
  email: string;
  name?: string;
}

/** Fetch the user behind a device-flow access token (for the "Logged in as" greeting). */
export async function getSessionUser(
  apiUrl: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SessionUser | null> {
  const res = await fetchImpl(`${apiUrl}/api/auth/get-session`, {
    headers: { authorization: `Bearer ${accessToken}`, "user-agent": CLIENT_ID },
  });
  if (!res.ok) return null;
  const data = (await res.json().catch(() => null)) as { user?: SessionUser } | null;
  return data?.user ?? null;
}

export interface CreatedKey {
  key: string;
  /** Server-side id of the minted key — absent only if an old server predates it. */
  id?: string;
  name?: string | null;
  /** Ladder label the server granted — "read" for the user lane today. */
  scope?: string;
}

/**
 * Thrown by `createUserApiKey` when the server refuses the mint with its
 * active-key cap (409 `api_key_limit`, `USER_API_KEY_MAX_ACTIVE` in the
 * monorepo). Distinguished from a plain mint failure so callers (`releases
 * login`) can offer a way forward — list keys, revoke one, retry — instead of
 * just failing.
 */
export class ApiKeyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApiKeyLimitError";
  }
}

/**
 * Exchange the device-flow session for a durable `relu_` API key. Hits the API
 * worker's own `/v1/api-keys` route — the SAME surface the web panel uses, NOT
 * Better Auth's raw `/api/auth/api-key/create` — so the server injects the owner,
 * caps the scope, and encodes the permission ladder in one place. We request
 * `read` explicitly: user keys are capped read-only server-side, and asking for
 * anything higher is a 400. The device-flow session token rides as a Bearer
 * credential, which the worker's `requireSession` honors via its `bearer()` plugin.
 */
export async function createUserApiKey(
  apiUrl: string,
  accessToken: string,
  name: string,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedKey> {
  const res = await fetchImpl(`${apiUrl}/v1/api-keys`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": CLIENT_ID,
    },
    body: JSON.stringify({ name, scope: "read" }),
  });
  if (!res.ok) {
    if (res.status === 409) {
      const body = (await res.json().catch(() => null)) as {
        error?: { code?: string; message?: string };
      } | null;
      if (body?.error?.code === "api_key_limit") {
        throw new ApiKeyLimitError(body.error?.message ?? "Active user API key limit reached.");
      }
    }
    throw new Error(`Login succeeded but issuing an API key failed (HTTP ${res.status}).`);
  }
  return (await res.json()) as CreatedKey;
}

/**
 * List the signed-in user's API keys via the session-gated `GET /v1/api-keys`
 * — the same read `releases keys list` uses, called here with the device-flow
 * session token directly (no stored-credential lookup) so it can run
 * mid-login, before any credential has been written.
 */
export async function listUserApiKeys(
  apiUrl: string,
  sessionToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<UserApiKey[]> {
  const res = await fetchImpl(`${apiUrl}/v1/api-keys`, {
    headers: { authorization: `Bearer ${sessionToken}`, "user-agent": CLIENT_ID },
  });
  if (!res.ok) {
    throw new Error(`Could not list API keys (HTTP ${res.status}).`);
  }
  const data = (await res.json().catch(() => null)) as ListUserApiKeysResponse | null;
  return data?.apiKeys ?? [];
}

/**
 * Revoke one API key via the session-gated `DELETE /v1/api-keys/:id` — the
 * same delete `releases keys revoke` uses. Used both by `releases login` (to
 * drop the key it's replacing, and to free up room under the active-key cap)
 * and `releases auth logout` (to revoke server-side, best-effort).
 */
export async function revokeUserApiKey(
  apiUrl: string,
  sessionToken: string,
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const res = await fetchImpl(`${apiUrl}/v1/api-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${sessionToken}`, "user-agent": CLIENT_ID },
  });
  if (!res.ok) {
    throw new Error(`Could not revoke API key ${id} (HTTP ${res.status}).`);
  }
}

export interface DeviceLoginDeps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  openBrowser?: (url: string) => boolean;
  print?: (line: string) => void;
  /** Name recorded on the minted key (defaults to `releases-cli (<hostname>)`). */
  keyName?: string;
}

export interface DeviceLoginArgs {
  apiUrl: string;
  openInBrowser: boolean;
  deps?: DeviceLoginDeps;
}

export interface DeviceLoginResult {
  token: string;
  /** Server-side id of `token` — see `CreatedKey.id`. */
  id?: string;
  sessionToken: string;
  name?: string;
  scopes?: string[];
  apiUrl: string;
}

export interface DeviceAuthResult {
  sessionToken: string;
  user: SessionUser | null;
}

/**
 * Run the RFC 8628 device flow and return the session token only — mints NO key.
 * Used by `releases keys` to (re)establish a session for the management endpoints
 * without polluting the user's key list.
 */
export async function runDeviceAuth(args: DeviceLoginArgs): Promise<DeviceAuthResult> {
  const fetchImpl = args.deps?.fetchImpl ?? fetch;
  const print = args.deps?.print ?? ((l: string) => console.log(l));

  const code = await requestDeviceCode(args.apiUrl, fetchImpl);

  print(`\nTo connect the CLI, visit:\n  ${code.verification_uri}`);
  print(`and enter the code:\n  ${code.user_code}\n`);

  const target = code.verification_uri_complete ?? code.verification_uri;
  if (args.openInBrowser && args.deps?.openBrowser) {
    const ok = args.deps.openBrowser(target);
    print(ok ? "Opening your browser..." : `Open this URL manually:\n  ${target}`);
  } else if (args.openInBrowser) {
    // No injected opener in this context; the command layer wires the real one.
    print(`Open this URL to continue:\n  ${target}`);
  }

  print("Waiting for authorization...");
  const sessionToken = await pollForToken(args.apiUrl, code.device_code, {
    intervalSeconds: code.interval ?? 5,
    expiresInSeconds: code.expires_in,
    fetchImpl,
    sleep: args.deps?.sleep,
  });

  const user = await getSessionUser(args.apiUrl, sessionToken, fetchImpl);
  if (user) print(`Authorized as ${user.name ?? user.email}.`);

  return { sessionToken, user };
}

/**
 * Orchestrate the full device-login flow and return a credential payload for the
 * caller to persist. Pure of I/O specifics via injectable deps (fetch, sleep,
 * browser, print) so it's unit-testable. Does NOT write to disk — the command
 * layer owns persistence so storage stays in one place.
 */
export async function runDeviceLogin(args: DeviceLoginArgs): Promise<DeviceLoginResult> {
  const fetchImpl = args.deps?.fetchImpl ?? fetch;
  const keyName = args.deps?.keyName ?? "releases-cli";

  const { sessionToken } = await runDeviceAuth(args);
  const created = await createUserApiKey(args.apiUrl, sessionToken, keyName, fetchImpl);

  return {
    token: created.key,
    id: created.id,
    sessionToken,
    name: created.name ?? keyName,
    scopes: [created.scope ?? "read"],
    apiUrl: args.apiUrl,
  };
}
