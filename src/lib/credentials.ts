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
    if (typeof parsed?.token !== "string" || !parsed.token) return null;
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
