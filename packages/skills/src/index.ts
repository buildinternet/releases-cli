import { existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Absolute path to the bundled skills directory. Resolves to the sibling
 * `skills/` folder when installed from npm (via the `files` field) and falls
 * back to the repo-root `skills/` directory during local development.
 */
export function skillsDir(): string {
  const packaged = resolve(here, "..", "skills");
  if (existsSync(packaged)) return packaged;
  const repoRoot = resolve(here, "..", "..", "..", "skills");
  return repoRoot;
}

export function skillPath(name: string): string {
  return join(skillsDir(), name);
}
