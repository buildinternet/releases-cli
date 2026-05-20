import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { getDataDir } from "@releases/lib/config";

export interface StoredCredential {
  token: string;
  name?: string;
  scopes?: string[];
  /** API URL the token was verified against (prod/staging tokens don't cross DBs). */
  apiUrl: string;
  savedAt: string;
}

function credentialPath(): string {
  return join(getDataDir(), "credentials");
}

export function readCredential(): StoredCredential | null {
  const path = credentialPath();
  if (!existsSync(path)) return null;
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as StoredCredential;
    // The file is a trust boundary (it may be hand-edited or corrupt), so
    // validate the full shape and return null on any mismatch — callers can then
    // trust the returned StoredCredential matches its declared type.
    if (typeof parsed?.token !== "string" || !parsed.token) return null;
    if (typeof parsed.apiUrl !== "string" || !parsed.apiUrl) return null;
    if (typeof parsed.savedAt !== "string" || !parsed.savedAt) return null;
    if (parsed.name !== undefined && typeof parsed.name !== "string") return null;
    // `scopes` is optional, but if present it must be a string array — a malformed
    // value (e.g. a hand-edited string) would crash callers that iterate or
    // `.join` it (auth status, the admin scope pre-flight).
    if (
      parsed.scopes !== undefined &&
      (!Array.isArray(parsed.scopes) || !parsed.scopes.every((s) => typeof s === "string"))
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeCredential(cred: StoredCredential): void {
  const path = credentialPath();
  mkdirSync(dirname(path), { recursive: true });
  // Atomic write: temp file + rename so a crash never leaves a partial file.
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(cred, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, path);
  chmodSync(path, 0o600);
}

/** Remove the stored credential. Returns true if a file was actually removed. */
export function clearCredential(): boolean {
  const path = credentialPath();
  if (!existsSync(path)) return false;
  rmSync(path);
  return true;
}
