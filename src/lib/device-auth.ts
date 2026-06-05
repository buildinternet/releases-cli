/**
 * RFC 8628 device-authorization client for `releases login`. Plain `fetch`
 * against the API worker's Better Auth handler — no `better-auth` dependency, so
 * the thin client stays thin. The flow: request a device+user code, have the
 * human approve it in a browser, poll for a session access token, then exchange
 * that session for a durable `relu_` API key (created server-side, capped at the
 * requested scope) and hand it back to the caller to store.
 */

// Must match DEVICE_AUTH_CLIENT_ID in @buildinternet/releases-core/api-token — the
// worker's validateClient allow-list rejects any other client_id (fail closed).
// Hard-coded until a published core version exposing that constant is adopted; keep
// the literal in lockstep until then.
const CLIENT_ID = "releases-cli";
const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

export type UserScope = "read" | "write";

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
  scope: UserScope,
  fetchImpl: typeof fetch = fetch,
): Promise<DeviceCodeResponse> {
  const res = await fetchImpl(`${apiUrl}/api/auth/device/code`, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": CLIENT_ID },
    body: JSON.stringify({ client_id: CLIENT_ID, scope }),
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
    await sleep(interval * 1000);

    const res = await fetchImpl(`${apiUrl}/api/auth/device/token`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": CLIENT_ID },
      body: JSON.stringify({
        grant_type: GRANT_TYPE,
        device_code: deviceCode,
        client_id: CLIENT_ID,
      }),
    });
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
  name?: string | null;
  /** Single ladder label the server granted ("read" | "write"). */
  scope?: string;
}

/**
 * Exchange the device-flow session for a durable `relu_` API key. Hits the API
 * worker's own `/v1/api-keys` route — the SAME surface the web panel uses, NOT
 * Better Auth's raw `/api/auth/api-key/create` — so the server injects the owner,
 * caps the scope to read/write, and encodes the permission ladder in one place. The
 * device-flow session token rides as a Bearer credential, which the worker's
 * `requireSession` honors via its `bearer()` plugin.
 */
export async function createUserApiKey(
  apiUrl: string,
  accessToken: string,
  name: string,
  scope: UserScope,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedKey> {
  const res = await fetchImpl(`${apiUrl}/v1/api-keys`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      "user-agent": CLIENT_ID,
    },
    body: JSON.stringify({ name, scope }),
  });
  if (!res.ok) {
    throw new Error(`Login succeeded but issuing an API key failed (HTTP ${res.status}).`);
  }
  return (await res.json()) as CreatedKey;
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
  scope: UserScope;
  openInBrowser: boolean;
  deps?: DeviceLoginDeps;
}

export interface DeviceLoginResult {
  token: string;
  name?: string;
  scopes?: string[];
  apiUrl: string;
}

/**
 * Orchestrate the full device-login flow and return a credential payload for the
 * caller to persist. Pure of I/O specifics via injectable deps (fetch, sleep,
 * browser, print) so it's unit-testable. Does NOT write to disk — the command
 * layer owns persistence so storage stays in one place.
 */
export async function runDeviceLogin(args: DeviceLoginArgs): Promise<DeviceLoginResult> {
  const fetchImpl = args.deps?.fetchImpl ?? fetch;
  const print = args.deps?.print ?? ((l: string) => console.log(l));
  const keyName = args.deps?.keyName ?? "releases-cli";

  const code = await requestDeviceCode(args.apiUrl, args.scope, fetchImpl);

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
  const accessToken = await pollForToken(args.apiUrl, code.device_code, {
    intervalSeconds: code.interval ?? 5,
    expiresInSeconds: code.expires_in,
    fetchImpl,
    sleep: args.deps?.sleep,
  });

  const sessionUser = await getSessionUser(args.apiUrl, accessToken, fetchImpl);
  if (sessionUser) print(`Authorized as ${sessionUser.name ?? sessionUser.email}.`);

  const created = await createUserApiKey(args.apiUrl, accessToken, keyName, args.scope, fetchImpl);

  return {
    token: created.key,
    name: created.name ?? keyName,
    scopes: [created.scope ?? args.scope],
    apiUrl: args.apiUrl,
  };
}
