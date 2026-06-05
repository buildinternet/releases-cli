import { describe, it, expect } from "bun:test";
import { requestDeviceCode, pollForToken, runDeviceLogin } from "../../src/lib/device-auth.js";

const BASE = "https://test.example.com";

describe("requestDeviceCode", () => {
  it("POSTs client_id + scope and returns the code payload", async () => {
    let seen: { url: string; body: unknown } | null = null;
    const fakeFetch = (async (url: string, init?: RequestInit) => {
      seen = { url, body: JSON.parse(String(init?.body)) };
      return new Response(
        JSON.stringify({
          device_code: "dev123",
          user_code: "ABCD1234",
          verification_uri: "https://releases.sh/device",
          verification_uri_complete: "https://releases.sh/device?user_code=ABCD1234",
          expires_in: 900,
          interval: 5,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;

    const res = await requestDeviceCode(BASE, fakeFetch);
    expect(res.user_code).toBe("ABCD1234");
    expect(seen!.url).toBe(`${BASE}/api/auth/device/code`);
    // No OAuth scope: the minted key is read-only server-side, nothing to request.
    expect(seen!.body).toEqual({ client_id: "releases-cli" });
  });
});

describe("pollForToken", () => {
  it("returns the access_token after an authorization_pending round", async () => {
    let call = 0;
    const fakeFetch = (async () => {
      call += 1;
      if (call === 1) {
        return new Response(JSON.stringify({ error: "authorization_pending" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ access_token: "tok_abc" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const token = await pollForToken(BASE, "dev123", {
      intervalSeconds: 0, // no real waiting in tests
      expiresInSeconds: 60,
      fetchImpl: fakeFetch,
      sleep: async () => {},
    });
    expect(token).toBe("tok_abc");
    expect(call).toBe(2);
  });

  it("throws when the user denies", async () => {
    const fakeFetch = (async () =>
      new Response(JSON.stringify({ error: "access_denied" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      })) as unknown as typeof fetch;

    await expect(
      pollForToken(BASE, "dev123", {
        intervalSeconds: 0,
        expiresInSeconds: 60,
        fetchImpl: fakeFetch,
        sleep: async () => {},
      }),
    ).rejects.toThrow(/denied/i);
  });
});

describe("runDeviceLogin", () => {
  it("returns a stored-credential payload on success", async () => {
    const apiUrl = BASE;
    let opened: string | null = null;
    const printed: string[] = [];

    const fakeFetch = (async (url: string) => {
      const u = String(url);
      if (u.endsWith("/api/auth/device/code")) {
        return new Response(
          JSON.stringify({
            device_code: "dev123",
            user_code: "ABCD1234",
            verification_uri: `${apiUrl}/device`,
            verification_uri_complete: `${apiUrl}/device?user_code=ABCD1234`,
            expires_in: 900,
            interval: 0,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (u.endsWith("/api/auth/device/token")) {
        return new Response(JSON.stringify({ access_token: "tok_abc" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith("/api/auth/get-session")) {
        return new Response(JSON.stringify({ user: { email: "z@example.com", name: "Zach" } }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (u.endsWith("/v1/api-keys")) {
        return new Response(
          JSON.stringify({
            key: "relu_secretkey",
            id: "ak_1",
            name: "releases-cli",
            start: "relu_sec",
            scope: "read",
            remaining: null,
            expiresAt: null,
            createdAt: "2026-06-05T00:00:00.000Z",
          }),
          { status: 201, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected url ${u}`);
    }) as unknown as typeof fetch;

    const result = await runDeviceLogin({
      apiUrl,
      openInBrowser: true,
      deps: {
        fetchImpl: fakeFetch,
        sleep: async () => {},
        openBrowser: (url) => {
          opened = url;
          return true;
        },
        print: (line) => printed.push(line),
        keyName: "releases-cli (testhost)",
      },
    });

    expect(result.token).toBe("relu_secretkey");
    expect(result.apiUrl).toBe(apiUrl);
    // User keys are read-only; the server returns the granted label, stored as-is.
    expect(result.scopes).toEqual(["read"]);
    expect(opened).toBe(`${apiUrl}/device?user_code=ABCD1234`);
    // The user code is shown to the human at least once.
    expect(printed.join("\n")).toContain("ABCD1234");
  });
});
