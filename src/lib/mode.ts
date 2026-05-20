import { logger } from "@releases/lib/logger";
import { readCredential } from "./credentials.js";

const DEFAULT_API_URL = "https://api.releases.sh";

let _apiUrl: string | null = null;

export interface ResolvedCredential {
  token: string | null;
  source: "env" | "file" | "none";
  scopes?: string[];
  name?: string;
  apiUrl?: string;
}

/** Resolve the active credential: explicit env var wins, then the stored file. */
export function resolveCredential(): ResolvedCredential {
  const envKey = process.env.RELEASED_API_KEY;
  if (envKey) return { token: envKey, source: "env" };
  const stored = readCredential();
  if (stored) {
    return {
      token: stored.token,
      source: "file",
      scopes: stored.scopes,
      name: stored.name,
      apiUrl: stored.apiUrl,
    };
  }
  return { token: null, source: "none" };
}

/** True when any credential resolves (env var or stored file). */
export function isAuthenticated(): boolean {
  return resolveCredential().token !== null;
}

/** Back-compat alias — historically "admin mode" meant "a credential is present". */
export const isAdminMode = isAuthenticated;

export function getApiUrl(): string {
  if (!_apiUrl) {
    const url = process.env.RELEASED_API_URL || DEFAULT_API_URL;
    _apiUrl = url.replace(/\/$/, "");
  }
  return _apiUrl;
}

export function getApiKey(): string {
  const { token } = resolveCredential();
  if (!token) {
    throw new Error("Not authenticated. Run `releases auth login` or set RELEASED_API_KEY.");
  }
  return token;
}

/**
 * Call at CLI startup. With stored credentials, a custom RELEASED_API_URL is no
 * longer fatal (you may be about to `releases auth login`, or doing anonymous
 * reads) — it downgrades to a warning. Also warns when a stored token was
 * verified against a different environment than the active URL.
 */
export function validateConfig(): void {
  const cred = resolveCredential();
  if (process.env.RELEASED_API_URL && cred.source === "none") {
    logger.warn(
      "RELEASED_API_URL is set but no API token is configured. Requests will be unauthenticated — run `releases auth login` to authenticate.",
    );
  }
  if (cred.source === "file" && cred.apiUrl && cred.apiUrl !== getApiUrl()) {
    logger.warn(
      `Stored token was verified against ${cred.apiUrl}, but the active API URL is ${getApiUrl()}. It may not be accepted.`,
    );
  }
}
