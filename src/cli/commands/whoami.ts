import { Command } from "commander";
import chalk from "chalk";
import { getApiKey, getApiUrl, isAdminMode } from "../../lib/mode.js";
import { VERSION } from "../version.js";
import { writeJson } from "../../lib/output.js";
import { RELEASES_CLI_UA } from "../../lib/user-agent.js";

export type WhoamiStatus = {
  version: string;
  apiUrl: string;
  apiUrlSource: "default" | "env";
  mode: "admin" | "public";
  apiKey: { set: boolean; hint: string | null };
  check?: { ok: boolean; status: number | null; message: string | null };
};

export function redactApiKey(key: string): string {
  if (key.length <= 8) return "****";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export function collectWhoami(): WhoamiStatus {
  const envUrl = process.env.RELEASED_API_URL;
  const rawKey = process.env.RELEASED_API_KEY;
  return {
    version: VERSION,
    apiUrl: getApiUrl(),
    apiUrlSource: envUrl ? "env" : "default",
    mode: isAdminMode() ? "admin" : "public",
    apiKey: {
      set: !!rawKey,
      hint: rawKey ? redactApiKey(rawKey) : null,
    },
  };
}

async function probeApi(mode: WhoamiStatus["mode"]): Promise<NonNullable<WhoamiStatus["check"]>> {
  // Admin probe hits an auth-gated read so a bad key surfaces as 401.
  // Public probe hits a public read to confirm connectivity.
  // We call fetch directly (not apiFetch) because apiFetch returns null on
  // GET 404 — which would false-positive the probe for a misconfigured URL.
  const path = mode === "admin" ? "/v1/admin/blocklist?limit=1" : "/v1/sources?limit=1";
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": RELEASES_CLI_UA,
  };
  if (mode === "admin") headers["Authorization"] = `Bearer ${getApiKey()}`;
  try {
    const res = await fetch(`${getApiUrl()}${path}`, { headers });
    res.body?.cancel();
    return res.ok
      ? { ok: true, status: res.status, message: null }
      : { ok: false, status: res.status, message: `HTTP ${res.status} ${res.statusText}` };
  } catch (err) {
    return { ok: false, status: null, message: err instanceof Error ? err.message : String(err) };
  }
}

export function registerWhoamiCommand(parent: Command): void {
  parent
    .command("whoami")
    .description("Show current CLI mode, API URL, and auth status")
    .option("--json", "Output as JSON")
    .option("--check", "Probe the API to verify connectivity and auth")
    .action(async (opts: { json?: boolean; check?: boolean }) => {
      const status: WhoamiStatus = collectWhoami();
      if (opts.check) status.check = await probeApi(status.mode);

      if (opts.json) {
        await writeJson(status);
        return;
      }

      const label = (k: string) => chalk.dim(k.padEnd(10));
      const row = (k: string, v: string) => console.log(`${label(k)} ${v}`);

      console.log(`${chalk.bold("releases")} ${chalk.dim(`v${status.version}`)}`);
      const urlSuffix = status.apiUrlSource === "default" ? " (default)" : " (RELEASED_API_URL)";
      row("API URL", `${status.apiUrl}${chalk.dim(urlSuffix)}`);
      row("Mode", status.mode === "admin" ? chalk.green("admin") : chalk.cyan("public"));
      row(
        "Auth",
        status.apiKey.set
          ? `${chalk.green("✓")} RELEASED_API_KEY set ${chalk.dim(`(${status.apiKey.hint})`)}`
          : `${chalk.dim("—")} RELEASED_API_KEY not set`,
      );

      if (status.check) {
        const probeLabel = status.mode === "admin" ? "API + auth" : "API";
        row(
          "Probe",
          status.check.ok
            ? `${chalk.green("✓")} ${probeLabel} reachable`
            : `${chalk.red("✗")} ${status.check.message}`,
        );
      } else {
        console.log("");
        console.log(chalk.dim('Run "releases whoami --check" to verify connectivity.'));
      }
    });
}
