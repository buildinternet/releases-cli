import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";

const prevEnv: { url?: string; key?: string } = {};
beforeAll(() => {
  prevEnv.url = process.env.RELEASES_API_URL;
  prevEnv.key = process.env.RELEASES_API_KEY;
  process.env.RELEASES_API_URL = "https://test.example.com";
  process.env.RELEASES_API_KEY = "test-key";
});
afterAll(() => {
  if (prevEnv.url === undefined) delete process.env.RELEASES_API_URL;
  else process.env.RELEASES_API_URL = prevEnv.url;
  if (prevEnv.key === undefined) delete process.env.RELEASES_API_KEY;
  else process.env.RELEASES_API_KEY = prevEnv.key;
});

const client = await import("../../src/api/me-webhooks.js");

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("me-webhooks client wire contract", () => {
  let originalFetch: typeof globalThis.fetch;
  let calls: Array<{ url: string; method: string; body: unknown }> = [];
  let responder: (url: string) => Response;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    calls = [];
    responder = () => json({});
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const u = String(url);
      calls.push({
        url: u,
        method: init?.method ?? "GET",
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      return responder(u);
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("listMyWebhooks GETs /v1/me/webhooks", async () => {
    responder = () => json({ subscriptions: [{ id: "whk_1", scope: "follows" }] });
    const subs = await client.listMyWebhooks();
    expect(subs).toHaveLength(1);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.url.endsWith("/v1/me/webhooks")).toBe(true);
  });

  it("createMyWebhook POSTs follows scope", async () => {
    responder = () => json({ id: "whk_2", signingKey: "abc", scope: "follows" }, 201);
    const created = await client.createMyWebhook({
      url: "https://ex.com/h",
      scope: "follows",
    });
    expect(created.signingKey).toBe("abc");
    expect(calls[0]!.method).toBe("POST");
    expect(calls[0]!.body).toEqual({ url: "https://ex.com/h", scope: "follows" });
  });

  it("createMyWebhook POSTs org scope with orgSlug", async () => {
    responder = () => json({ id: "whk_3", signingKey: "def", scope: "org" });
    await client.createMyWebhook({ url: "https://ex.com/o", orgSlug: "vercel" });
    expect(calls[0]!.body).toEqual({ url: "https://ex.com/o", orgSlug: "vercel" });
  });

  it("updateMyWebhook PATCHes enabled", async () => {
    responder = () => json({ id: "whk_4", enabled: false });
    await client.updateMyWebhook("whk_4", { enabled: false });
    expect(calls[0]!.method).toBe("PATCH");
    expect(calls[0]!.url.endsWith("/v1/me/webhooks/whk_4")).toBe(true);
    expect(calls[0]!.body).toEqual({ enabled: false });
  });

  it("deleteMyWebhook DELETEs by id", async () => {
    responder = () => new Response(null, { status: 204 });
    await client.deleteMyWebhook("whk_5");
    expect(calls[0]!.method).toBe("DELETE");
  });

  it("testMyWebhook POSTs /test", async () => {
    responder = () => json({ enqueued: true, eventId: "evt_1" });
    const out = await client.testMyWebhook("whk_6");
    expect(out.eventId).toBe("evt_1");
    expect(calls[0]!.url.endsWith("/test")).toBe(true);
  });
});
