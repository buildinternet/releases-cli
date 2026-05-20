import { describe, it, expect, beforeEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "rel-pf-"));
process.env.RELEASED_DATA_DIR = dir;

const { writeCredential, clearCredential } = await import("../../src/lib/credentials.js");
const { preflightScopeWarning } = await import("../../src/lib/preflight.js");

afterAll(() => rmSync(dir, { recursive: true, force: true }));
beforeEach(() => {
  delete process.env.RELEASED_API_KEY;
  clearCredential();
});

describe("preflightScopeWarning", () => {
  it("warns for a file token without write scope", () => {
    writeCredential({ token: "relk_a_b", scopes: ["read"], apiUrl: "u", savedAt: "t" });
    expect(preflightScopeWarning()).toMatch(/read/);
  });

  it("no warning when the file token has write", () => {
    writeCredential({ token: "relk_a_b", scopes: ["read", "write"], apiUrl: "u", savedAt: "t" });
    expect(preflightScopeWarning()).toBeNull();
  });

  it("no warning when the file token has admin (admin implies write)", () => {
    writeCredential({ token: "relk_a_b", scopes: ["admin"], apiUrl: "u", savedAt: "t" });
    expect(preflightScopeWarning()).toBeNull();
  });

  it("no warning when the file token has the wildcard scope", () => {
    writeCredential({ token: "relk_a_b", scopes: ["*"], apiUrl: "u", savedAt: "t" });
    expect(preflightScopeWarning()).toBeNull();
  });

  it("no warning for env-sourced tokens (scopes unknown)", () => {
    process.env.RELEASED_API_KEY = "env-key";
    expect(preflightScopeWarning()).toBeNull();
  });
});
