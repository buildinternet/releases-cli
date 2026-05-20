import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "rel-creds-"));
process.env.RELEASED_DATA_DIR = dir;

const { readCredential, writeCredential, clearCredential } =
  await import("../../src/lib/credentials.js");

afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("credentials", () => {
  it("round-trips a credential and stores it 0600", () => {
    writeCredential({
      token: "relk_abc_def",
      name: "laptop",
      scopes: ["read", "write"],
      apiUrl: "https://api.releases.sh",
      savedAt: "2026-05-20T00:00:00.000Z",
    });
    const read = readCredential();
    expect(read?.token).toBe("relk_abc_def");
    expect(read?.scopes).toEqual(["read", "write"]);
    const mode = statSync(join(dir, "credentials")).mode & 0o777;
    expect(mode).toBe(0o600);
  });

  it("returns null on a corrupt file", () => {
    writeFileSync(join(dir, "credentials"), "{ not json");
    expect(readCredential()).toBeNull();
  });

  it("clear removes the file and reports it", () => {
    writeCredential({ token: "relk_x_y", apiUrl: "u", savedAt: "t" });
    expect(clearCredential()).toBe(true);
    expect(readCredential()).toBeNull();
    expect(clearCredential()).toBe(false);
  });
});
