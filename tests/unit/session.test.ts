import { describe, it, expect, afterEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "rel-sess-"));
process.env.RELEASED_DATA_DIR = dir;

const { readCredential, writeCredential, clearCredential } =
  await import("../../src/lib/credentials.js");
const { getSessionToken, clearSessionToken } = await import("../../src/lib/session.js");

afterEach(() => clearCredential());
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("getSessionToken", () => {
  it("returns the stored session token without re-auth", async () => {
    writeCredential({
      token: "relu_x",
      sessionToken: "sess_stored",
      apiUrl: "https://test.example.com",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    let called = false;
    const t = await getSessionToken("https://test.example.com", {
      deviceAuth: async () => {
        called = true;
        return "sess_new";
      },
      deviceLogin: async () => {
        called = true;
        return { token: "relu_new", sessionToken: "sess_new", scopes: ["read"] };
      },
    });
    expect(t).toBe("sess_stored");
    expect(called).toBe(false);
  });

  it("refreshes the session WITHOUT minting when a relu_ token already exists", async () => {
    writeCredential({
      token: "relu_existing",
      apiUrl: "https://test.example.com",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    let minted = false;
    const t = await getSessionToken("https://test.example.com", {
      deviceAuth: async () => "sess_refreshed",
      deviceLogin: async () => {
        minted = true;
        return { token: "relu_new", sessionToken: "x", scopes: ["read"] };
      },
    });
    expect(t).toBe("sess_refreshed");
    expect(minted).toBe(false);
    const cred = readCredential();
    expect(cred?.sessionToken).toBe("sess_refreshed");
    expect(cred?.token).toBe("relu_existing"); // durable key untouched
  });

  it("does a full login (mints key + session) when no credential exists", async () => {
    clearCredential();
    const t = await getSessionToken("https://test.example.com", {
      deviceAuth: async () => {
        throw new Error("should not be called");
      },
      deviceLogin: async () => ({
        token: "relu_minted",
        sessionToken: "sess_full",
        name: "n",
        scopes: ["read"],
      }),
    });
    expect(t).toBe("sess_full");
    const cred = readCredential();
    expect(cred?.token).toBe("relu_minted"); // valid non-empty token persisted
    expect(cred?.sessionToken).toBe("sess_full");
  });

  it("does NOT reuse a session bound to a different environment", async () => {
    // Credential established against prod; the active URL is staging.
    writeCredential({
      token: "relu_prod",
      sessionToken: "sess_prod",
      apiUrl: "https://api.releases.sh",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    let refreshed = false;
    const t = await getSessionToken("https://api-staging.releases.sh", {
      deviceAuth: async () => {
        refreshed = true;
        return "sess_should_not_refresh_foreign";
      },
      deviceLogin: async () => ({
        token: "relu_staging",
        sessionToken: "sess_staging",
        scopes: ["read"],
      }),
    });
    // Foreign session is not returned; a full login rebinds to the active env.
    expect(t).toBe("sess_staging");
    expect(refreshed).toBe(false); // never refreshes onto a foreign-env credential
    const cred = readCredential();
    expect(cred?.apiUrl).toBe("https://api-staging.releases.sh");
    expect(cred?.token).toBe("relu_staging");
    expect(cred?.sessionToken).toBe("sess_staging");
  });
});

describe("clearSessionToken", () => {
  it("drops only the session token, keeping the relu_ key", () => {
    writeCredential({
      token: "relu_keep",
      sessionToken: "sess_drop",
      apiUrl: "https://test.example.com",
      savedAt: "2026-06-06T00:00:00.000Z",
    });
    clearSessionToken();
    const cred = readCredential();
    expect(cred?.token).toBe("relu_keep");
    expect(cred?.sessionToken).toBeUndefined();
  });
});
