import { logger } from "@releases/lib/logger";

const DEFAULT_API_URL = "https://api.releases.sh";

let _apiUrl: string | null = null;
let _apiKey: string | null = null;
let _admin: boolean | null = null;

export function isAdminMode(): boolean {
  if (_admin === null) _admin = !!process.env.RELEASED_API_KEY;
  return _admin;
}

export function getApiUrl(): string {
  if (!_apiUrl) {
    const url = process.env.RELEASED_API_URL || DEFAULT_API_URL;
    _apiUrl = url.replace(/\/$/, "");
  }
  return _apiUrl;
}

export function getApiKey(): string {
  if (!_apiKey) {
    const key = process.env.RELEASED_API_KEY;
    if (!key) throw new Error("RELEASED_API_KEY is not set");
    _apiKey = key;
  }
  return _apiKey;
}

/**
 * Call at CLI startup. If RELEASED_API_URL is explicitly set without an
 * RELEASED_API_KEY we treat that as a misconfigured admin setup and bail.
 * Otherwise we fall through to the default public endpoint.
 */
export function validateConfig(): void {
  if (process.env.RELEASED_API_URL && !process.env.RELEASED_API_KEY) {
    logger.error("RELEASED_API_URL is set but RELEASED_API_KEY is missing.");
    logger.error(
      "Set RELEASED_API_KEY to authenticate with the remote API, or unset RELEASED_API_URL for public access.",
    );
    process.exit(1);
  }
}
