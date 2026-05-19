import { describe, it, expect } from "bun:test";
import { shouldShowCompletionHint } from "../../src/cli/completion/hint.js";

const TTY: Parameters<typeof shouldShowCompletionHint>[0] = {
  isInteractive: true,
  hintAlreadyShown: false,
  completionFileExists: false,
  env: { SHELL: "/bin/zsh" },
};

describe("shouldShowCompletionHint", () => {
  it("shows when interactive + first run + no completion file", () => {
    expect(shouldShowCompletionHint(TTY)).toBe(true);
  });

  it("suppresses if hint marker exists", () => {
    expect(shouldShowCompletionHint({ ...TTY, hintAlreadyShown: true })).toBe(false);
  });

  it("suppresses if completion file already on disk", () => {
    expect(shouldShowCompletionHint({ ...TTY, completionFileExists: true })).toBe(false);
  });

  it("suppresses in non-interactive context (pipe, CI)", () => {
    expect(shouldShowCompletionHint({ ...TTY, isInteractive: false })).toBe(false);
  });

  it("suppresses on unsupported shells", () => {
    expect(shouldShowCompletionHint({ ...TTY, env: { SHELL: "/bin/csh" } })).toBe(false);
    expect(shouldShowCompletionHint({ ...TTY, env: {} })).toBe(false);
  });

  it("suppresses when RELEASES_NO_COMPLETION_HINT=1", () => {
    expect(
      shouldShowCompletionHint({
        ...TTY,
        env: { SHELL: "/bin/zsh", RELEASES_NO_COMPLETION_HINT: "1" },
      }),
    ).toBe(false);
  });

  it("suppresses for CI / agent clients", () => {
    expect(
      shouldShowCompletionHint({
        ...TTY,
        env: { SHELL: "/bin/zsh", CI: "true" },
      }),
    ).toBe(false);
    expect(
      shouldShowCompletionHint({
        ...TTY,
        env: { SHELL: "/bin/zsh", RELEASED_CLIENT_KIND: "managed-agent" },
      }),
    ).toBe(false);
  });
});
