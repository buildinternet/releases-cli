import { mkdirSync, writeFileSync, existsSync } from "fs";
import { dirname, basename } from "path";
import type { SupportedShell } from "./generate.js";

type Env = Record<string, string | undefined>;

export function detectShell(env: Env = process.env): SupportedShell | null {
  const shell = env.SHELL;
  if (!shell) return null;
  const name = basename(shell);
  if (name === "zsh") return "zsh";
  if (name === "bash") return "bash";
  if (name === "fish") return "fish";
  return null;
}

export function defaultInstallPath(shell: SupportedShell, env: Env = process.env): string {
  const home = env.HOME ?? "";
  switch (shell) {
    case "zsh":
      return `${home}/.zsh/completions/_releases`;
    case "bash": {
      const xdgData = env.XDG_DATA_HOME ?? `${home}/.local/share`;
      return `${xdgData}/bash-completion/completions/releases`;
    }
    case "fish": {
      const xdgConfig = env.XDG_CONFIG_HOME ?? `${home}/.config`;
      return `${xdgConfig}/fish/completions/releases.fish`;
    }
  }
}

export function rcSnippet(shell: SupportedShell, path: string): string {
  switch (shell) {
    case "zsh": {
      const dir = dirname(path);
      return [
        "Add the following to ~/.zshrc (if not already present):",
        "",
        `  fpath=(${dir} $fpath)`,
        "  autoload -Uz compinit && compinit",
        "",
        "Then start a new shell or run: exec zsh",
      ].join("\n");
    }
    case "bash":
      return [
        "This path is auto-loaded by bash-completion v2 — no rc change needed.",
        "If completions don't appear, ensure bash-completion is installed:",
        "  brew install bash-completion@2   # macOS",
        "  apt install bash-completion       # Debian/Ubuntu",
        "Then start a new shell.",
      ].join("\n");
    case "fish":
      return "Fish auto-loads files in completions/. Start a new shell to pick it up.";
  }
}

export interface InstallResult {
  path: string;
  alreadyExisted: boolean;
}

export function writeCompletionFile(path: string, content: string): InstallResult {
  const alreadyExisted = existsSync(path);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, content, "utf8");
  return { path, alreadyExisted };
}
