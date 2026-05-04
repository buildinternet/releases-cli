import { describe, it, expect } from "bun:test";
import { runCli } from "../utils.js";

/**
 * Coverage for #103 workstream 3: --notes-file / --parse-instructions-file
 * replace the inline string forms (which are quote-hostile and silently
 * truncate at unescaped newlines for AI-generated bodies).
 *
 * Behavioral coverage uses --help and the mutex error path because
 * exercising the full flow requires HTTP mocks (per the convention
 * documented in idempotent-create.test.ts).
 */

describe("admin playbook --notes-file (#103 ws3)", () => {
  const adminEnv = { RELEASED_API_KEY: "test-key" };

  it("documents --notes-file in --help", () => {
    const { stdout, exitCode } = runCli(["admin", "playbook", "--help"], { env: adminEnv });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--notes-file");
  });

  it("keeps --notes documented but marks it deprecated", () => {
    const { stdout, exitCode } = runCli(["admin", "playbook", "--help"], { env: adminEnv });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--notes");
    expect(stdout).toContain("deprecated");
  });

  it("errors when --notes and --notes-file are passed together", () => {
    const { stderr, exitCode } = runCli(
      ["admin", "playbook", "acme", "--notes", "x", "--notes-file", "-"],
      { env: adminEnv },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("--notes and --notes-file are mutually exclusive");
  });
});

describe("source update --parse-instructions-file (#103 ws3)", () => {
  const adminEnv = { RELEASED_API_KEY: "test-key" };

  it("documents --parse-instructions-file in update --help", () => {
    const { stdout, exitCode } = runCli(["admin", "source", "update", "--help"], { env: adminEnv });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--parse-instructions-file");
  });

  it("documents --parse-instructions-file in deprecated edit --help", () => {
    const { stdout, exitCode } = runCli(["admin", "source", "edit", "--help"], { env: adminEnv });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--parse-instructions-file");
  });

  it("keeps --parse-instructions documented but marks it deprecated", () => {
    const { stdout, exitCode } = runCli(["admin", "source", "update", "--help"], { env: adminEnv });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("--parse-instructions");
    expect(stdout).toContain("deprecated");
  });

  it("errors when --parse-instructions and --parse-instructions-file are passed together", () => {
    const { stderr, exitCode } = runCli(
      [
        "admin",
        "source",
        "update",
        "src_dummy",
        "--parse-instructions",
        "x",
        "--parse-instructions-file",
        "-",
      ],
      { env: adminEnv },
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain(
      "--parse-instructions and --parse-instructions-file are mutually exclusive",
    );
  });
});
