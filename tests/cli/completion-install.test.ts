import { describe, it, expect } from "bun:test";
import { detectShell, defaultInstallPath, rcSnippet } from "../../src/cli/completion/install.js";

describe("detectShell", () => {
  it("detects zsh from $SHELL", () => {
    expect(detectShell({ SHELL: "/bin/zsh" })).toBe("zsh");
    expect(detectShell({ SHELL: "/usr/local/bin/zsh" })).toBe("zsh");
  });

  it("detects bash from $SHELL", () => {
    expect(detectShell({ SHELL: "/bin/bash" })).toBe("bash");
  });

  it("detects fish from $SHELL", () => {
    expect(detectShell({ SHELL: "/usr/local/bin/fish" })).toBe("fish");
  });

  it("returns null when $SHELL is unset or unknown", () => {
    expect(detectShell({})).toBe(null);
    expect(detectShell({ SHELL: "/bin/csh" })).toBe(null);
  });
});

describe("defaultInstallPath", () => {
  const HOME = "/home/test";

  it("zsh: ~/.zsh/completions/_releases", () => {
    expect(defaultInstallPath("zsh", { HOME })).toBe("/home/test/.zsh/completions/_releases");
  });

  it("bash: XDG bash-completion path", () => {
    expect(defaultInstallPath("bash", { HOME })).toBe(
      "/home/test/.local/share/bash-completion/completions/releases",
    );
  });

  it("fish: ~/.config/fish/completions/releases.fish", () => {
    expect(defaultInstallPath("fish", { HOME })).toBe(
      "/home/test/.config/fish/completions/releases.fish",
    );
  });

  it("respects $XDG_DATA_HOME for bash", () => {
    expect(defaultInstallPath("bash", { HOME, XDG_DATA_HOME: "/custom/data" })).toBe(
      "/custom/data/bash-completion/completions/releases",
    );
  });

  it("respects $XDG_CONFIG_HOME for fish", () => {
    expect(defaultInstallPath("fish", { HOME, XDG_CONFIG_HOME: "/custom/config" })).toBe(
      "/custom/config/fish/completions/releases.fish",
    );
  });

  it("falls back to os.homedir() when HOME is unset", () => {
    // With env={} we drop through to os.homedir(). In any normal test env that
    // returns a real path, so the result is non-empty and ends with the
    // shell-specific suffix — never a root-prefixed bogus path like /.zsh/...
    const zshPath = defaultInstallPath("zsh", {});
    expect(zshPath).toMatch(/.+\/\.zsh\/completions\/_releases$/);
    expect(zshPath.startsWith("/.")).toBe(false);

    const bashPath = defaultInstallPath("bash", {});
    expect(bashPath).toMatch(/.+\/bash-completion\/completions\/releases$/);
    expect(bashPath.startsWith("/.")).toBe(false);

    const fishPath = defaultInstallPath("fish", {});
    expect(fishPath).toMatch(/.+\/fish\/completions\/releases\.fish$/);
    expect(fishPath.startsWith("/.")).toBe(false);
  });
});

describe("rcSnippet", () => {
  it("zsh: provides fpath + compinit instructions", () => {
    const snip = rcSnippet("zsh", "/home/test/.zsh/completions/_releases");
    expect(snip).toContain("fpath");
    expect(snip).toContain("/home/test/.zsh/completions");
    expect(snip).toContain("compinit");
  });

  it("bash: provides source line if location not auto-loaded", () => {
    const snip = rcSnippet("bash", "/home/test/.local/share/bash-completion/completions/releases");
    // The XDG path is auto-loaded by bash-completion v2, so the snippet should
    // explain that no rc change is needed.
    expect(snip).toContain("auto-load");
  });

  it("fish: nothing to add — completions/ dir is auto-loaded", () => {
    const snip = rcSnippet("fish", "/home/test/.config/fish/completions/releases.fish");
    expect(snip).toContain("auto-load");
  });
});
