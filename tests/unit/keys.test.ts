import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { InvalidArgumentError } from "commander";
import { keysRequest, parseExpiresInDays } from "../../src/cli/commands/keys.js";
import { ApiError } from "../../src/lib/errors.js";

const BASE = "https://test.example.com";

// keysRequest routes through the shared apiFetch transport, which resolves
// its base URL from RELEASES_API_URL (see api/core.ts) rather than the
// `apiUrl` argument passed here (that argument only scopes the session-token
// storage lookups in KeysRequestDeps). Point the env at BASE so the mocked
// `fetch` below actually observes the requests. No admin credential is set,
// so apiFetch's own Authorization header stays out of the way of the
// session-token Bearer header keysRequest attaches itself.
const prevEnv: { url?: string; key?: string } = {};
beforeAll(() => {
  prevEnv.url = process.env.RELEASES_API_URL;
  prevEnv.key = process.env.RELEASES_API_KEY;
  process.env.RELEASES_API_URL = BASE;
  delete process.env.RELEASES_API_KEY;
});
afterAll(() => {
  if (prevEnv.url === undefined) delete process.env.RELEASES_API_URL;
  else process.env.RELEASES_API_URL = prevEnv.url;
  if (prevEnv.key === undefined) delete process.env.RELEASES_API_KEY;
  else process.env.RELEASES_API_KEY = prevEnv.key;
});

describe("parseExpiresInDays", () => {
  it("parses a valid integer in range", () => {
    expect(parseExpiresInDays("30")).toBe(30);
    expect(parseExpiresInDays("1")).toBe(1);
    expect(parseExpiresInDays("365")).toBe(365);
  });

  it("rejects non-numeric input (never returns NaN)", () => {
    expect(() => parseExpiresInDays("abc")).toThrow(InvalidArgumentError);
    expect(() => parseExpiresInDays("30d")).toThrow(InvalidArgumentError);
    expect(() => parseExpiresInDays("")).toThrow(InvalidArgumentError);
  });

  it("rejects non-integers and out-of-range values", () => {
    expect(() => parseExpiresInDays("3.5")).toThrow(InvalidArgumentError);
    expect(() => parseExpiresInDays("0")).toThrow(InvalidArgumentError);
    expect(() => parseExpiresInDays("366")).toThrow(InvalidArgumentError);
    expect(() => parseExpiresInDays("-5")).toThrow(InvalidArgumentError);
  });
});

describe("keysRequest", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends the session token as a Bearer credential", async () => {
    let seenAuth = "";
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenAuth = String((init?.headers as Record<string, string>)?.authorization ?? "");
      return new Response(JSON.stringify({ apiKeys: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await keysRequest(
      BASE,
      "/v1/api-keys",
      { method: "GET" },
      {
        getToken: async () => "sess_tok",
        onReauth: async () => "sess_tok2",
      },
    );
    expect(seenAuth).toBe("Bearer sess_tok");
  });

  it("re-auths and retries once on 401", async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      if (call === 1)
        return new Response(JSON.stringify({ error: "unauthorized" }), {
          status: 401,
          headers: { "content-type": "application/json" },
        });
      return new Response(JSON.stringify({ apiKeys: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    let reauthed = false;
    const result = await keysRequest<{ apiKeys: unknown[] }>(
      BASE,
      "/v1/api-keys",
      { method: "GET" },
      {
        getToken: async () => "sess_old",
        onReauth: async () => {
          reauthed = true;
          return "sess_new";
        },
      },
    );
    expect(reauthed).toBe(true);
    expect(call).toBe(2);
    expect(result.apiKeys).toEqual([]);
  });

  it("does not retry more than once (second 401 surfaces)", async () => {
    let call = 0;
    globalThis.fetch = (async () => {
      call += 1;
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;

    let caught: unknown;
    try {
      await keysRequest(
        BASE,
        "/v1/api-keys",
        { method: "GET" },
        {
          getToken: async () => "a",
          onReauth: async () => "b",
        },
      );
    } catch (err) {
      caught = err;
    }
    expect(call).toBe(2);
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
  });

  it("reuses the same Idempotency-Key across the 401 reauth retry", async () => {
    const seenKeys: string[] = [];
    globalThis.fetch = (async (_url: string, init?: RequestInit) => {
      seenKeys.push(String((init?.headers as Record<string, string>)?.["Idempotency-Key"] ?? ""));
      if (seenKeys.length === 1) {
        return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify({ id: "key_1" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    await keysRequest(
      BASE,
      "/v1/api-keys",
      { method: "POST", body: JSON.stringify({ name: "x" }) },
      {
        getToken: async () => "sess_old",
        onReauth: async () => "sess_new",
      },
    );
    expect(seenKeys).toHaveLength(2);
    expect(seenKeys[0]).not.toBe("");
    expect(seenKeys[0]).toBe(seenKeys[1]);
  });
});
