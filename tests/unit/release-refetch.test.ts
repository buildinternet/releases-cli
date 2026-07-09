import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Drive the real mode.ts via env (a top-level mock.module leaks across files —
// see api-client.test.ts). getApiUrl() memoizes the base URL process-wide, so
// this must be set before anything imports/calls into src/api.
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

const { refetchRelease } = await import("../../src/api/releases.js");

const DRY_RUN_RESPONSE = {
  dryRun: true,
  releaseId: "rel_abc123",
  fetchUrl: "https://example.com/posts/foo",
  via: "fetch",
  current: {
    title: "Old title",
    contentChars: 120,
    mediaCount: 0,
    publishedAt: "2026-01-01T00:00:00.000Z",
    url: "https://example.com/#foo",
  },
  proposed: {
    title: "New title",
    contentChars: 480,
    mediaCount: 2,
    publishedAt: "2026-06-01T00:00:00.000Z",
    url: "https://example.com/posts/foo",
  },
};

const WRITE_RESPONSE = {
  dryRun: false,
  releaseId: "rel_abc123",
  fetchUrl: "https://example.com/posts/foo",
  via: "fetch",
  updated: DRY_RUN_RESPONSE.proposed,
};

// ── Client wire contract ───────────────────────────────────────────────────

describe("refetchRelease client", () => {
  let originalFetch: typeof globalThis.fetch;
  let dir: string;
  let capturedUrl = "";
  let capturedBody: Record<string, unknown> | null = null;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    dir = mkdtempSync(join(tmpdir(), "rel-refetch-client-"));
    process.env.RELEASES_RUN_DIR = dir;
    capturedUrl = "";
    capturedBody = null;
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      const body = capturedBody.dryRun === false ? WRITE_RESPONSE : DRY_RUN_RESPONSE;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    delete process.env.RELEASES_RUN_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("POSTs to /v1/workflows/refetch-release with releaseId and explicit dryRun:true", async () => {
    const result = await refetchRelease({ releaseId: "rel_abc123", dryRun: true });
    expect(capturedUrl).toBe("https://test.example.com/v1/workflows/refetch-release");
    expect(capturedBody).toMatchObject({ releaseId: "rel_abc123", dryRun: true });
    expect(result.dryRun).toBe(true);
  });

  it("sends explicit dryRun:false with --apply, forwarding a url override", async () => {
    const result = await refetchRelease({
      releaseId: "rel_abc123",
      url: "https://example.com/posts/foo",
      dryRun: false,
    });
    expect(capturedBody).toMatchObject({
      releaseId: "rel_abc123",
      url: "https://example.com/posts/foo",
      dryRun: false,
    });
    expect(result.dryRun).toBe(false);
  });

  it("surfaces the endpoint's actionable message on a 400 fragment-URL rejection", async () => {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "bad_request",
            type: "validation_error",
            message:
              "This release's stored URL is a synthesized index anchor (or missing) — fetching it would ingest the index page. Pass the post's canonical `url` explicitly.",
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      )) as unknown as typeof globalThis.fetch;
    await expect(refetchRelease({ releaseId: "rel_abc123", dryRun: true })).rejects.toThrow(
      /canonical `url` explicitly/,
    );
  });
});

// ── Command behavior ─────────────────────────────────────────────────────────

describe("releaseRefetchAction", () => {
  let originalFetch: typeof globalThis.fetch;
  let originalExit: typeof process.exit;
  let dir: string;
  let postBody: Record<string, unknown> | null = null;
  let exitCode: number | undefined;

  function mockRefetch(response: unknown = DRY_RUN_RESPONSE) {
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      postBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(JSON.stringify(response), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as unknown as typeof globalThis.fetch;
  }

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    originalExit = process.exit;
    dir = mkdtempSync(join(tmpdir(), "rel-refetch-cmd-"));
    process.env.RELEASES_RUN_DIR = dir;
    postBody = null;
    exitCode = undefined;
    process.exit = ((code?: number) => {
      exitCode = code ?? 0;
      throw new Error(`process.exit(${code})`);
    }) as unknown as typeof process.exit;
    mockRefetch();
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
    process.exit = originalExit;
    delete process.env.RELEASES_RUN_DIR;
    rmSync(dir, { recursive: true, force: true });
  });

  it("dry-runs by default, sending explicit dryRun:true", async () => {
    const { releaseRefetchAction } = await import("../../src/cli/commands/release.js");
    await releaseRefetchAction("rel_abc123", {});
    expect(postBody).toMatchObject({ releaseId: "rel_abc123", dryRun: true });
  });

  it("--apply sends explicit dryRun:false", async () => {
    mockRefetch(WRITE_RESPONSE);
    const { releaseRefetchAction } = await import("../../src/cli/commands/release.js");
    await releaseRefetchAction("rel_abc123", { apply: true });
    expect((postBody as { dryRun?: boolean }).dryRun).toBe(false);
  });

  it("forwards --url", async () => {
    const { releaseRefetchAction } = await import("../../src/cli/commands/release.js");
    await releaseRefetchAction("rel_abc123", { url: "https://example.com/posts/foo" });
    expect((postBody as { url?: string }).url).toBe("https://example.com/posts/foo");
  });

  it("rejects a non-rel_ id before making any network call", async () => {
    const { releaseRefetchAction } = await import("../../src/cli/commands/release.js");
    let threw = false;
    try {
      await releaseRefetchAction("src_notarelease", {});
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(exitCode).toBe(1);
    expect(postBody).toBeNull();
  });
});
