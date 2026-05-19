import { existsSync, writeFileSync, chmodSync } from "fs";
import { join } from "path";
import { getDataDir } from "@releases/lib/config";
import { defaultInstallPath, detectShell } from "./install.js";

const HINT_MARKER = "completion-hint-shown";
const TRUTHY_CI_VALUES = new Set(["true", "1", "yes"]);

type Env = Record<string, string | undefined>;

function isTruthyEnvFlag(value: string | undefined): boolean {
  return value !== undefined && TRUTHY_CI_VALUES.has(value.toLowerCase());
}

export interface HintGate {
  isInteractive: boolean;
  hintAlreadyShown: boolean;
  completionFileExists: boolean;
  env: Env;
}

export function shouldShowCompletionHint(gate: HintGate): boolean {
  if (!gate.isInteractive) return false;
  if (gate.hintAlreadyShown) return false;
  if (gate.completionFileExists) return false;
  if (isTruthyEnvFlag(gate.env.RELEASES_NO_COMPLETION_HINT)) return false;
  if (isTruthyEnvFlag(gate.env.CI) || isTruthyEnvFlag(gate.env.GITHUB_ACTIONS)) return false;
  if (gate.env.RELEASED_CLIENT_KIND && gate.env.RELEASED_CLIENT_KIND !== "external") {
    return false;
  }
  if (!detectShell(gate.env)) return false;
  return true;
}

function markerPath(): string {
  return join(getDataDir(), HINT_MARKER);
}

export function markCompletionHintShown(): void {
  try {
    writeFileSync(markerPath(), new Date().toISOString(), "utf8");
    chmodSync(markerPath(), 0o600);
  } catch {
    // ignore — hint state is best-effort
  }
}

export function maybeShowCompletionHint(): void {
  // Cheap checks first so non-TTY / disabled invocations skip the filesystem
  // entirely — this runs after every successful CLI command.
  const env = process.env as Env;
  const cheapGate: HintGate = {
    isInteractive: process.stderr.isTTY === true,
    hintAlreadyShown: false,
    completionFileExists: false,
    env,
  };
  if (!shouldShowCompletionHint(cheapGate)) return;

  const shell = detectShell(env);
  if (!shell) return;
  if (existsSync(markerPath())) return;
  if (existsSync(defaultInstallPath(shell, env))) return;

  process.stderr.write(
    [
      "",
      "\x1b[2mTip: enable shell completion with:\x1b[0m",
      `\x1b[2m  releases completion install ${shell}\x1b[0m`,
      "\x1b[2m(set RELEASES_NO_COMPLETION_HINT=1 to silence)\x1b[0m",
      "",
    ].join("\n") + "\n",
  );
  markCompletionHintShown();
}
