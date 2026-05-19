import { readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { getDataDir } from "@releases/lib/config";
import { RELEASES_CLI_UA } from "./user-agent.js";

const CACHE_FILE = "skills-check.json";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const FETCH_TIMEOUT_MS = 2000;
const REPO_OWNER = "buildinternet";
const REPO_NAME = "releases-cli";
const REPO_BRANCH = "main";
const SKILLS_DIR_NAME = "skills";
const DISABLE_ENV_VAR = "RELEASES_DISABLE_SKILL_UPDATE_CHECK";

export interface SkillsCache {
  /** Tree SHA recorded the last time the user ran `releases skills install`. */
  baseline: string | null;
  /** Tree SHA from the most recent GitHub check. */
  latest: string | null;
  /** Timestamp (ms epoch) of the most recent GitHub check. */
  checkedAt: number;
}

const EMPTY_CACHE: SkillsCache = { baseline: null, latest: null, checkedAt: 0 };

// ── Pure helpers (testable without fs / network) ───────────────────────

export function parseCache(raw: string): SkillsCache | null {
  try {
    const data = JSON.parse(raw) as Partial<SkillsCache>;
    if (typeof data.checkedAt !== "number") return null;
    return {
      baseline: typeof data.baseline === "string" ? data.baseline : null,
      latest: typeof data.latest === "string" ? data.latest : null,
      checkedAt: data.checkedAt,
    };
  } catch {
    return null;
  }
}

export function isOutdated(baseline: string | null, latest: string | null): boolean {
  if (!baseline || !latest) return false;
  return baseline !== latest;
}

export function isCheckSuppressed(env: NodeJS.ProcessEnv): boolean {
  const v = env[DISABLE_ENV_VAR];
  return v === "1" || v === "true";
}

export function buildNagMessage(): string {
  // Matches the dim ANSI style used by the existing CLI update check, so the
  // two notices read consistently when both fire.
  return "\x1b[2mYour installed releases skills are behind. Run `releases skills install` to refresh.\x1b[0m";
}

// ── Side-effect wrappers ────────────────────────────────────────────────

function cachePath(): string {
  return join(getDataDir(), CACHE_FILE);
}

function readCache(): SkillsCache | null {
  try {
    return parseCache(readFileSync(cachePath(), "utf8"));
  } catch {
    return null;
  }
}

function writeCache(cache: SkillsCache): void {
  try {
    writeFileSync(cachePath(), JSON.stringify(cache), "utf8");
  } catch {
    // best-effort
  }
}

async function fetchSkillsTreeSha(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/git/trees/${REPO_BRANCH}`,
        {
          headers: {
            accept: "application/vnd.github+json",
            "User-Agent": RELEASES_CLI_UA,
          },
          signal: controller.signal,
        },
      );
      if (!res.ok) return null;
      const data = (await res.json()) as { tree?: Array<{ path?: string; sha?: string }> };
      const entry = data.tree?.find((e) => e.path === SKILLS_DIR_NAME);
      return entry?.sha ?? null;
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Check whether the user's installed skills are behind the repo's `main` HEAD.
 * Returns a formatted notice string when stale, or null in every other case
 * (no baseline, env-disabled, network failure, fresh). Never throws.
 *
 * Caller is responsible for non-TTY gating — kept out of this function so
 * tests can exercise it without simulating a TTY.
 */
export async function checkForSkillsUpdate(): Promise<string | null> {
  try {
    if (isCheckSuppressed(process.env)) return null;

    const cached = readCache() ?? EMPTY_CACHE;
    if (!cached.baseline) return null; // never installed via this CLI

    const now = Date.now();
    let latest: string | null = cached.latest;

    if (now - cached.checkedAt >= CHECK_INTERVAL_MS || !latest) {
      latest = await fetchSkillsTreeSha();
      if (latest) {
        writeCache({ baseline: cached.baseline, latest, checkedAt: now });
      }
    }

    if (!isOutdated(cached.baseline, latest)) return null;
    return buildNagMessage();
  } catch {
    return null;
  }
}

/**
 * Record the current `skills/` tree SHA as the baseline. Called after a
 * successful `releases skills install` so subsequent staleness checks have
 * something to compare against. Fire-and-forget; never throws.
 */
export async function recordSkillsInstallBaseline(): Promise<void> {
  try {
    const sha = await fetchSkillsTreeSha();
    if (!sha) return;
    writeCache({ baseline: sha, latest: sha, checkedAt: Date.now() });
  } catch {
    // best-effort
  }
}
