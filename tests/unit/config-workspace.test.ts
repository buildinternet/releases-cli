import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

// config.ts caches the data dir on first read, so the env var must be set
// before the module is imported.
const dir = mkdtempSync(join(tmpdir(), "rel-work-"));
process.env.RELEASED_DATA_DIR = dir;

const { getWorkDir, getRunsDir, expandHome } = await import("@releases/lib/config");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("maintenance workspace dirs", () => {
  it("getWorkDir returns <dataDir>/work and creates it", () => {
    const work = getWorkDir();
    expect(work).toBe(join(dir, "work"));
    expect(statSync(work).isDirectory()).toBe(true);
  });

  it("getRunsDir returns <dataDir>/work/runs and creates it", () => {
    const runs = getRunsDir();
    expect(runs).toBe(join(dir, "work", "runs"));
    expect(statSync(runs).isDirectory()).toBe(true);
  });
});

describe("expandHome", () => {
  it("expands a leading ~/ to the home dir", () => {
    expect(expandHome("~/x/y")).toBe(join(homedir(), "x", "y"));
  });

  it("expands a bare ~ to the home dir", () => {
    expect(expandHome("~")).toBe(homedir());
  });

  it("leaves absolute, relative, and ~user paths unchanged", () => {
    expect(expandHome("/abs/path")).toBe("/abs/path");
    expect(expandHome("relative/path")).toBe("relative/path");
    expect(expandHome("~user/x")).toBe("~user/x");
  });
});
