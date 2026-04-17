import { spawnSync } from "child_process";
import { join } from "path";
import { stripAnsi } from "../src/lib/sanitize.js";

const CLI_PATH = join(import.meta.dirname, "..", "src", "index.ts");

export function runCli(
  args: string[],
  options?: { env?: Record<string, string>; timeout?: number },
): { stdout: string; stderr: string; exitCode: number } {
  // OSS CLI is remote-only — a real-looking URL must be set so the CLI starts.
  // Commands that don't hit the API (e.g. `categories`) succeed without it.
  const safeEnv: Record<string, string> = {
    ...process.env as Record<string, string>,
    RELEASED_API_URL: "https://test.example.com",
    RELEASED_API_KEY: "test",
    ...options?.env,
  };
  const result = spawnSync("bun", [CLI_PATH, ...args], {
    encoding: "utf-8",
    stdio: ["pipe", "pipe", "pipe"],
    env: safeEnv,
    timeout: options?.timeout ?? 30_000,
  });
  return {
    stdout: stripAnsi(result.stdout ?? ""),
    stderr: stripAnsi(result.stderr ?? ""),
    exitCode: result.status ?? 1,
  };
}
