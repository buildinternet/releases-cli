import { hostname } from "node:os";
import { readCredential, writeCredential } from "./credentials.js";
import { runDeviceAuth, runDeviceLogin } from "./device-auth.js";
import { openBrowser } from "./open-browser.js";

/**
 * Injectable device-flow entry points (production uses the real RFC 8628 flow;
 * tests inject deterministic stand-ins).
 * - `deviceAuth` establishes a session token WITHOUT minting a key — used when a
 *   durable relu_ key already exists and only the session needs refreshing.
 * - `deviceLogin` mints a read key AND establishes a session — used the first
 *   time, when there is no stored credential to attach a session to (a credential
 *   must always carry a non-empty `token`, so we cannot persist a session alone).
 */
export interface SessionDeps {
  deviceAuth?: (apiUrl: string) => Promise<string>;
  deviceLogin?: (
    apiUrl: string,
  ) => Promise<{ token: string; sessionToken: string; name?: string; scopes?: string[] }>;
}

function defaultDeviceAuth(apiUrl: string): Promise<string> {
  return runDeviceAuth({
    apiUrl,
    openInBrowser: true,
    deps: { openBrowser, print: (l) => console.log(l) },
  }).then((r) => r.sessionToken);
}

function defaultDeviceLogin(apiUrl: string) {
  return runDeviceLogin({
    apiUrl,
    openInBrowser: true,
    deps: { openBrowser, keyName: `releases-cli (${hostname()})`, print: (l) => console.log(l) },
  });
}

/**
 * Return a session token for the /v1/api-keys management endpoints. Uses the
 * stored token if present; otherwise (re)establishes one via the device flow and
 * persists it onto a valid credential (one that always has a non-empty relu_ key).
 */
export async function getSessionToken(apiUrl: string, deps: SessionDeps = {}): Promise<string> {
  const existing = readCredential();
  // A stored token is bound to the API URL it was verified against (prod/staging
  // tokens don't cross DBs), so only reuse or refresh a credential established
  // against THIS environment. A different (or missing) apiUrl is a non-match — we
  // fall through to a full login that re-binds the credential to the active URL,
  // never reusing a foreign session or writing a session onto a foreign credential.
  const sameEnv = existing?.apiUrl === apiUrl;

  if (sameEnv && existing?.sessionToken) return existing.sessionToken;

  if (sameEnv && existing?.token) {
    // A durable relu_ key for this env already exists — refresh the session only, mint nothing.
    const sessionToken = await (deps.deviceAuth ?? defaultDeviceAuth)(apiUrl);
    writeCredential({ ...existing, sessionToken, savedAt: new Date().toISOString() });
    return sessionToken;
  }

  // No usable same-env credential — full login so a valid credential (key + session),
  // bound to this apiUrl, lands.
  const res = await (deps.deviceLogin ?? defaultDeviceLogin)(apiUrl);
  writeCredential({
    token: res.token,
    sessionToken: res.sessionToken,
    name: res.name,
    scopes: res.scopes,
    apiUrl,
    savedAt: new Date().toISOString(),
  });
  return res.sessionToken;
}

/** Clear only the stored session token (e.g. after a 401), keeping the relu_ key. */
export function clearSessionToken(): void {
  const existing = readCredential();
  if (!existing) return;
  const { sessionToken: _drop, ...rest } = existing;
  writeCredential({ ...rest, savedAt: new Date().toISOString() });
}
