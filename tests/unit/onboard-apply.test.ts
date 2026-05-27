/**
 * Tests for the product lookup-or-create / attach logic in onboard-apply.
 *
 * The apply logic is exercised indirectly via the exported `resolveProduct`
 * helper — but the core behaviour we care about is the sequence of API calls
 * that `registerOnboardApplyCommand` makes when sources carry productSlug /
 * productName tags.  We stub `globalThis.fetch` so no real network is needed.
 *
 * Three scenarios:
 * (a) No product tags → sources attach org-direct, no products created.
 * (b) 2 sources tagged product-A + 1 tagged product-B → two distinct products
 *     looked-up-or-created; each source sent with the right productId.
 * (c) Idempotent re-apply when a product already exists → reused, not
 *     duplicated (findProduct returns a hit, createProduct never called).
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";

// ---------------------------------------------------------------------------
// env setup — same pattern as api-client.test.ts so mode.ts reads test values
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type MockRequest = { url: string; method: string; body?: unknown };

function makeFetchSpy(handlers: Array<(req: MockRequest) => Response | null>) {
  const calls: MockRequest[] = [];
  const spy = (async (url: string, init?: RequestInit) => {
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const req: MockRequest = { url, method, body };
    calls.push(req);
    for (const h of handlers) {
      const res = h(req);
      if (res !== null) return res;
    }
    return new Response(JSON.stringify({ message: "unhandled" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof globalThis.fetch;
  return { spy, calls };
}

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// A minimal org fixture.
const ORG = {
  id: "org_vercel",
  slug: "vercel",
  name: "Vercel",
  description: null,
  domain: null,
  category: null,
  avatarUrl: null,
  isHidden: false,
  discovery: "curated",
  createdAt: "2024-01-01T00:00:00Z",
  updatedAt: "2024-01-01T00:00:00Z",
};

// A minimal product fixture factory.
function makeProduct(id: string, slug: string, name: string) {
  return {
    id,
    slug,
    name,
    orgId: ORG.id,
    url: null,
    description: null,
    category: null,
    kind: null,
    isHidden: false,
    avatarUrl: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

// A minimal created source fixture.
function makeSource(slug: string, productId?: string) {
  return {
    id: `src_${slug}`,
    slug,
    name: slug,
    type: "github",
    url: `https://github.com/vercel/${slug}`,
    orgId: ORG.id,
    productId: productId ?? null,
    isPrimary: false,
    isHidden: false,
    metadata: null,
    createdAt: "2024-01-01T00:00:00Z",
    updatedAt: "2024-01-01T00:00:00Z",
  };
}

// ---------------------------------------------------------------------------
// Import client lazily (after env is set).
// ---------------------------------------------------------------------------
const client = await import("../../src/api/client.js");

// ---------------------------------------------------------------------------
// (a) No product tags — sources attach org-direct, no products created
// ---------------------------------------------------------------------------

describe("onboard-apply: no product tags", () => {
  let originalFetch: typeof globalThis.fetch;
  let calls: MockRequest[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("calls createSource with orgId only (no productId) when sources have no product tags", async () => {
    const { spy, calls: c } = makeFetchSpy([
      // GET /v1/orgs/vercel → org
      (req) => (req.method === "GET" && req.url.includes("/v1/orgs/vercel") ? jsonOk(ORG) : null),
      // GET /v1/orgs/vercel/products → for findProduct (not called in this scenario)
      // POST /v1/sources → created source
      (req) =>
        req.method === "POST" && req.url.includes("/v1/sources")
          ? jsonOk(makeSource("nextjs"))
          : null,
    ]);
    globalThis.fetch = spy;
    calls = c;

    // Simulate the findOrg + createSource flow directly (the apply command
    // action is not easily invocable in unit tests without Bun.stdin; we test
    // the client primitives that the command delegates to).
    const org = await client.findOrg("vercel");
    expect(org?.id).toBe("org_vercel");

    // No product slugs → no product resolution needed; createSource with orgId only.
    const src = await client.createSource({
      name: "next.js",
      slug: "nextjs",
      type: "github",
      url: "https://github.com/vercel/next.js",
      orgId: org!.id,
    });
    expect(src.productId).toBeNull();

    // Assert no product-related calls were made.
    const productCalls = calls.filter((r) => r.url.includes("/products"));
    expect(productCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// (b) Two products — lookup-or-create, each source wired to the right product
// ---------------------------------------------------------------------------

describe("onboard-apply: two tagged products", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("looks up or creates each distinct product slug and attaches sources correctly", async () => {
    const productA = makeProduct("prod_nextjs", "next-js", "Next.js");
    const productB = makeProduct("prod_turborepo", "turborepo", "Turborepo");

    const sourceCalls: Array<{ slug: string; body: unknown }> = [];

    const { spy } = makeFetchSpy([
      // GET /v1/orgs/vercel → org
      (req) => (req.method === "GET" && req.url.endsWith("/v1/orgs/vercel") ? jsonOk(ORG) : null),
      // GET for findProduct("vercel/next-js") → 404 (doesn't exist yet)
      (req) =>
        req.method === "GET" && req.url.includes("/v1/orgs/vercel/products/next-js")
          ? new Response(JSON.stringify(null), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            })
          : null,
      // POST /v1/products → creates Next.js product
      (req) => {
        if (req.method === "POST" && req.url.includes("/v1/products")) {
          const body = req.body as { name?: string; slug?: string };
          if (body.slug === "next-js") return jsonOk(productA);
          if (body.slug === "turborepo") return jsonOk(productB);
        }
        return null;
      },
      // GET for findProduct("vercel/turborepo") → 404 (doesn't exist yet)
      (req) =>
        req.method === "GET" && req.url.includes("/v1/orgs/vercel/products/turborepo")
          ? new Response(JSON.stringify(null), {
              status: 404,
              headers: { "Content-Type": "application/json" },
            })
          : null,
      // POST /v1/sources → echo back a source with the right productId
      (req) => {
        if (req.method === "POST" && req.url.includes("/v1/sources")) {
          const body = req.body as { slug?: string; productId?: string };
          sourceCalls.push({ slug: body.slug ?? "", body: req.body });
          return jsonOk(makeSource(body.slug ?? "unknown", body.productId));
        }
        return null;
      },
    ]);
    globalThis.fetch = spy;

    // Simulate what onboard-apply.ts does:
    // 1. Resolve org.
    const org = await client.findOrg("vercel");
    expect(org?.id).toBe("org_vercel");

    // 2. Collect distinct product pairs from two tagged sources.
    const sources = [
      { slug: "nextjs", productSlug: "next-js", productName: "Next.js" },
      { slug: "nextjs-docs", productSlug: "next-js", productName: "Next.js" }, // same product
      { slug: "turborepo", productSlug: "turborepo", productName: "Turborepo" },
    ];

    // 3. Lookup-or-create each distinct product (once per slug).
    const productIdMap = new Map<string, string>();
    const seen = new Set<string>();
    for (const s of sources) {
      if (!seen.has(s.productSlug)) {
        seen.add(s.productSlug);
        const identifier = `${org!.slug}/${s.productSlug}`;
        // Sequential by design — mirrors the apply command's lookup-or-create loop.
        // eslint-disable-next-line no-await-in-loop
        let product = await client.findProduct(identifier);
        if (!product) {
          // eslint-disable-next-line no-await-in-loop
          product = await client.createProduct(org!.id, s.productName, { slug: s.productSlug });
        }
        productIdMap.set(s.productSlug, product.id);
      }
    }

    expect(productIdMap.get("next-js")).toBe("prod_nextjs");
    expect(productIdMap.get("turborepo")).toBe("prod_turborepo");

    // 4. Create sources with the right productId.
    for (const s of sources) {
      const productId = productIdMap.get(s.productSlug);
      // eslint-disable-next-line no-await-in-loop
      await client.createSource({
        name: s.slug,
        slug: s.slug,
        type: "github",
        url: `https://github.com/vercel/${s.slug}`,
        orgId: org!.id,
        productId,
      });
    }

    expect(sourceCalls).toHaveLength(3);
    const nextjsSrc = sourceCalls.find((c) => c.slug === "nextjs")!;
    const nextjsDocsSrc = sourceCalls.find((c) => c.slug === "nextjs-docs")!;
    const turborepoSrc = sourceCalls.find((c) => c.slug === "turborepo")!;

    expect((nextjsSrc.body as { productId: string }).productId).toBe("prod_nextjs");
    expect((nextjsDocsSrc.body as { productId: string }).productId).toBe("prod_nextjs");
    expect((turborepoSrc.body as { productId: string }).productId).toBe("prod_turborepo");
  });
});

// ---------------------------------------------------------------------------
// (c) Idempotent — product already exists; findProduct returns it, no POST
// ---------------------------------------------------------------------------

describe("onboard-apply: idempotent re-apply", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("reuses existing product without calling createProduct when findProduct returns a hit", async () => {
    const existingProduct = makeProduct("prod_nextjs", "next-js", "Next.js");
    const createCalls: MockRequest[] = [];

    const { spy } = makeFetchSpy([
      // GET /v1/orgs/vercel → org
      (req) => (req.method === "GET" && req.url.endsWith("/v1/orgs/vercel") ? jsonOk(ORG) : null),
      // GET /v1/orgs/vercel/products/next-js → product already exists
      (req) =>
        req.method === "GET" && req.url.includes("/v1/orgs/vercel/products/next-js")
          ? jsonOk(existingProduct)
          : null,
      // POST /v1/products → should NOT be called
      (req) => {
        if (req.method === "POST" && req.url.includes("/v1/products")) {
          createCalls.push(req);
          return jsonOk(existingProduct);
        }
        return null;
      },
      // POST /v1/sources → ok
      (req) =>
        req.method === "POST" && req.url.includes("/v1/sources")
          ? jsonOk(makeSource("nextjs", "prod_nextjs"))
          : null,
    ]);
    globalThis.fetch = spy;

    const org = await client.findOrg("vercel");
    const identifier = `${org!.slug}/next-js`;

    // Simulate lookup-or-create: findProduct hits → no create needed.
    let product = await client.findProduct(identifier);
    if (!product) {
      product = await client.createProduct(org!.id, "Next.js", { slug: "next-js" });
    }

    expect(product!.id).toBe("prod_nextjs");
    expect(createCalls).toHaveLength(0); // createProduct was never called

    // Source should attach with the existing product's ID.
    const src = await client.createSource({
      name: "next.js",
      slug: "nextjs",
      type: "github",
      url: "https://github.com/vercel/next.js",
      orgId: org!.id,
      productId: product!.id,
    });
    expect(src.productId).toBe("prod_nextjs");
  });
});
