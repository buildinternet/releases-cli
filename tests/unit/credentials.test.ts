import { describe, it, expect, afterAll } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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

  it("returns null when scopes is malformed (not a string array)", () => {
    const base = {
      token: "relk_x_y",
      apiUrl: "https://api.releases.sh",
      savedAt: "2026-05-20T00:00:00.000Z",
    };
    writeFileSync(join(dir, "credentials"), JSON.stringify({ ...base, scopes: "read" }));
    expect(readCredential()).toBeNull();
    writeFileSync(join(dir, "credentials"), JSON.stringify({ ...base, scopes: [1, 2] }));
    expect(readCredential()).toBeNull();
  });

  it("returns null when required fields are missing or wrong-typed", () => {
    // only token — apiUrl and savedAt missing
    writeFileSync(join(dir, "credentials"), JSON.stringify({ token: "relk_x_y" }));
    expect(readCredential()).toBeNull();
    // apiUrl wrong type (number)
    writeFileSync(
      join(dir, "credentials"),
      JSON.stringify({ token: "relk_x_y", apiUrl: 123, savedAt: "t" }),
    );
    expect(readCredential()).toBeNull();
    // name wrong type (number)
    writeFileSync(
      join(dir, "credentials"),
      JSON.stringify({ token: "relk_x_y", apiUrl: "u", savedAt: "t", name: 42 }),
    );
    expect(readCredential()).toBeNull();
  });

  it("clear removes the file and reports it", () => {
    writeCredential({ token: "relk_x_y", apiUrl: "u", savedAt: "t" });
    expect(clearCredential()).toBe(true);
    expect(readCredential()).toBeNull();
    expect(clearCredential()).toBe(false);
  });

  it("round-trips an optional sessionToken", () => {
    writeCredential({
      token: "relu_abc",
      sessionToken: "sess_xyz",
      apiUrl: "https://api.releases.sh",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(readCredential()?.sessionToken).toBe("sess_xyz");
    clearCredential();
  });

  it("accepts a credential with no sessionToken (back-compat)", () => {
    writeCredential({
      token: "relu_abc",
      apiUrl: "https://api.releases.sh",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    expect(readCredential()?.sessionToken).toBeUndefined();
    clearCredential();
  });

  it("rejects a credential whose sessionToken is a non-string", () => {
    writeCredential({
      token: "relu_abc",
      apiUrl: "https://api.releases.sh",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    const path = join(dir, "credentials");
    const obj = JSON.parse(readFileSync(path, "utf8"));
    obj.sessionToken = 123;
    writeFileSync(path, JSON.stringify(obj));
    expect(readCredential()).toBeNull();
    clearCredential();
  });
});
