import { describe, it, expect, beforeEach, afterEach, mock } from "bun:test";
import type { SourceWithOrg } from "../../src/api/types.js";

// Mock mode.ts before importing the client — apiFetch calls getApiUrl/getApiKey.
mock.module("../../src/lib/mode.js", () => ({
  getApiUrl: () => "https://test.example.com",
  getApiKey: () => "test-key",
  isAdminMode: () => true,
}));

const client = await import("../../src/api/client.js");

function mockFetch(status: number, body: unknown = null) {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    })) as any;
}

// ---------------------------------------------------------------------------
// apiFetch 404 behavior — GET vs mutating methods
// ---------------------------------------------------------------------------

describe("apiFetch 404 handling", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns null for GET 404 (findSource)", async () => {
    mockFetch(404);
    const result = await client.findSource("nonexistent");
    expect(result).toBeNull();
  });

  it("returns null for GET 404 (findOrg)", async () => {
    mockFetch(404);
    const result = await client.findOrg("nonexistent");
    expect(result).toBeNull();
  });

  it("throws on POST 404 (addIgnoredUrl)", async () => {
    mockFetch(404, { message: "Not Found" });
    await expect(client.addIgnoredUrl("https://example.com", "org_123")).rejects.toThrow(
      /API error \(404\) on POST/,
    );
  });

  it("throws on DELETE 404 (deleteRelease)", async () => {
    mockFetch(404, { message: "Not Found" });
    await expect(client.deleteRelease("rel_123")).rejects.toThrow(/API error \(404\) on DELETE/);
  });

  it("throws on non-404 errors for GET", async () => {
    mockFetch(500, { message: "Internal Server Error" });
    await expect(client.findSource("test")).rejects.toThrow(/API error \(500\)/);
  });
});

// ---------------------------------------------------------------------------
// listSourcesWithOrg — response shape conforms to shared SourceWithOrg type
// ---------------------------------------------------------------------------

describe("listSourcesWithOrg", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const apiRow: SourceWithOrg = {
    id: "src_abc123",
    name: "Next.js",
    slug: "nextjs",
    type: "github",
    url: "https://github.com/vercel/next.js",
    orgName: "Vercel",
    orgSlug: "vercel",
    productName: null,
    productSlug: null,
    isPrimary: true,
    isHidden: false,
    metadata: '{"feedUrl":"https://nextjs.org/feed.xml"}',
    releaseCount: 42,
    latestVersion: "15.3.0",
    latestDate: "2026-04-10T00:00:00Z",
    lastFetchedAt: "2026-04-15T12:00:00Z",
    fetchPriority: "normal",
    changeDetectedAt: null,
    consecutiveNoChange: 3,
    consecutiveErrors: 0,
    nextFetchAfter: null,
  };

  it("returns response preserving all SourceWithOrg fields", async () => {
    globalThis.fetch = (async () =>
      new Response(JSON.stringify([apiRow]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })) as any;

    const rows = await client.listSourcesWithOrg();
    expect(rows).toHaveLength(1);

    const row = rows[0];
    expect(row.id).toBe("src_abc123");
    expect(row.orgSlug).toBe("vercel");
    expect(row.orgName).toBe("Vercel");
    expect(row.latestVersion).toBe("15.3.0");
    expect(row.productName).toBeNull();
    expect(row.productSlug).toBeNull();
    expect(row.isPrimary).toBe(true);
    expect(row.isHidden).toBe(false);
    expect(row.consecutiveNoChange).toBe(3);
    expect(row.consecutiveErrors).toBe(0);
  });

  it("passes filter params as query string", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;

    await client.listSourcesWithOrg({ orgSlug: "vercel", hasFeed: true, category: "ai" });
    expect(capturedUrl).toContain("orgSlug=vercel");
    expect(capturedUrl).toContain("has_feed=true");
    expect(capturedUrl).toContain("category=ai");
  });

  it("returns envelope with pagination totals when envelope=true", async () => {
    let capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          items: [apiRow],
          pagination: {
            page: 2,
            pageSize: 50,
            returned: 1,
            totalItems: 233,
            totalPages: 5,
            hasMore: true,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;

    const res = await client.listSourcesWithOrg({ envelope: true, limit: 50, page: 2 });
    expect(capturedUrl).toContain("envelope=true");
    expect(res.items).toHaveLength(1);
    expect(res.pagination.totalItems).toBe(233);
    expect(res.pagination.hasMore).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Embed backfill routes — paths moved from /v1/admin/embed/* to /v1/workflows/embed-*
// (monorepo #494); status endpoint stayed on /v1/admin/embed/status.
// ---------------------------------------------------------------------------

describe("embed backfill routes", () => {
  let originalFetch: typeof globalThis.fetch;
  let capturedUrl = "";

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    capturedUrl = "";
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(JSON.stringify({ processed: 0, remaining: 0, dryRun: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as any;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("embedReleases posts to /v1/workflows/embed-releases", async () => {
    await client.embedReleases({ dryRun: true });
    expect(capturedUrl).toBe("https://test.example.com/v1/workflows/embed-releases");
  });

  it("embedEntities posts to /v1/workflows/embed-entities", async () => {
    await client.embedEntities({ dryRun: true });
    expect(capturedUrl).toBe("https://test.example.com/v1/workflows/embed-entities");
  });

  it("embedChangelogs posts to /v1/workflows/embed-changelogs", async () => {
    await client.embedChangelogs({ dryRun: true });
    expect(capturedUrl).toBe("https://test.example.com/v1/workflows/embed-changelogs");
  });

  it("getEmbedStatus stays on /v1/admin/embed/status", async () => {
    globalThis.fetch = (async (url: string) => {
      capturedUrl = url;
      return new Response(
        JSON.stringify({
          releases: { total: 0, embedded: 0, remaining: 0 },
          entities: { total: 0, embedded: 0, remaining: 0 },
          changelogs: { total: 0, embedded: 0, remaining: 0 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as any;
    await client.getEmbedStatus();
    expect(capturedUrl).toBe("https://test.example.com/v1/admin/embed/status");
  });
});
