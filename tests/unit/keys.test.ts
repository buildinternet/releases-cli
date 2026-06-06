import { describe, it, expect } from "bun:test";
import { InvalidArgumentError } from "commander";
import { keysRequest, parseExpiresInDays } from "../../src/cli/commands/keys.js";

const BASE = "https://test.example.com";

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
  it("sends the session token as a Bearer credential", async () => {
    let seenAuth = "";
    const fetchImpl = (async (_url: string, init?: RequestInit) => {
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
        fetchImpl,
      },
    );
    expect(seenAuth).toBe("Bearer sess_tok");
  });

  it("re-auths and retries once on 401", async () => {
    let call = 0;
    const fetchImpl = (async () => {
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
    const res = await keysRequest(
      BASE,
      "/v1/api-keys",
      { method: "GET" },
      {
        getToken: async () => "sess_old",
        onReauth: async () => {
          reauthed = true;
          return "sess_new";
        },
        fetchImpl,
      },
    );
    expect(reauthed).toBe(true);
    expect(call).toBe(2);
    expect(res.status).toBe(200);
  });

  it("does not retry more than once (second 401 surfaces)", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call += 1;
      return new Response("{}", { status: 401, headers: { "content-type": "application/json" } });
    }) as unknown as typeof fetch;
    const res = await keysRequest(
      BASE,
      "/v1/api-keys",
      { method: "GET" },
      {
        getToken: async () => "a",
        onReauth: async () => "b",
        fetchImpl,
      },
    );
    expect(call).toBe(2);
    expect(res.status).toBe(401);
  });
});
