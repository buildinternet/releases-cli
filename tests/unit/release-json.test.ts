import { describe, expect, it } from "bun:test";
import { slimReleaseDetail, slimSearchHit, slimLatest } from "../../src/cli/render/release-json.js";

const rawDetail = {
  id: "rel_a",
  sourceId: "src_x",
  version: "agent-skills-v0.107.0",
  versionSort: "1_…",
  type: "feature",
  title: "Agent skills v0.107.0",
  content: "## Build\nfrom abc",
  summary: null,
  titleGenerated: "PostHog release",
  titleShort: null,
  url: "https://gh/x",
  contentHash: "deadbeef",
  media: [],
  publishedAt: "2026-05-22T20:25:54.000Z",
  prerelease: false,
  suppressed: false,
  suppressedReason: null,
  fetchedAt: "2026-05-22T22:02:21.755Z",
  embeddedAt: "2026-05-22T22:02:29.953Z",
  sourceName: "PostHog",
  sourceSlug: "posthog",
  sourceType: "github",
  org: { slug: "posthog", name: "PostHog" },
  composition: null,
} as never;

describe("slimReleaseDetail", () => {
  it("slim default keeps the allowlist, drops internals, derives excerpt", () => {
    const out = slimReleaseDetail(rawDetail, {
      contentChars: 51,
      contentTokens: 24,
      full: false,
    }) as Record<string, unknown>;
    expect(Object.keys(out).toSorted()).toEqual(
      [
        "contentChars",
        "contentTokens",
        "excerpt",
        "id",
        "org",
        "publishedAt",
        "source",
        "summary",
        "title",
        "url",
        "version",
      ].toSorted(),
    );
    expect(out.source).toEqual({ slug: "posthog", name: "PostHog" });
    expect(out.org).toEqual({ slug: "posthog", name: "PostHog" });
    expect(out.excerpt).toBe("Build from abc");
    expect(out).not.toHaveProperty("versionSort");
    expect(out).not.toHaveProperty("contentHash");
    expect(out).not.toHaveProperty("sourceId");
    expect(out).not.toHaveProperty("embeddedAt");
  });
  it("preserves zero content metrics (empty body is a real measurement)", () => {
    const out = slimReleaseDetail(rawDetail, {
      contentChars: 0,
      contentTokens: 0,
      full: false,
    }) as Record<string, unknown>;
    expect(out.contentChars).toBe(0);
    expect(out.contentTokens).toBe(0);
  });
  it("--full passes everything through plus computed size", () => {
    const out = slimReleaseDetail(rawDetail, {
      contentChars: 51,
      contentTokens: 24,
      full: true,
    }) as Record<string, unknown>;
    expect(out).toHaveProperty("versionSort");
    expect(out).toHaveProperty("contentHash");
    expect(out.contentChars).toBe(51);
  });
});

describe("slimSearchHit", () => {
  const hit = {
    id: "rel_e",
    sourceSlug: "langchain-changelog",
    sourceName: "LangChain",
    sourceType: "scrape",
    orgSlug: "langchain",
    orgName: "LangChain",
    version: null,
    title: "LangSmith now supports MCP",
    summary: "",
    titleGenerated: null,
    titleShort: null,
    content: "## Trace\nMCP calls",
    media: [],
    publishedAt: "2025-05-20T18:20:00.000Z",
    type: "feature",
    coverageCount: 0,
    score: 0.016,
  } as never;
  it("omits empty summary, derives excerpt from content, nests org", () => {
    const out = slimSearchHit(hit, false) as Record<string, unknown>;
    expect(out).not.toHaveProperty("score");
    expect(out).not.toHaveProperty("sourceType");
    expect(out.summary).toBeNull(); // empty string normalized to null
    expect(out.excerpt).toBe("Trace MCP calls");
    expect(out.org).toEqual({ slug: "langchain", name: "LangChain" });
    expect(out).not.toHaveProperty("url"); // search hit has no url on the wire
  });
  it("--full returns the hit verbatim", () => {
    const out = slimSearchHit(hit, true) as Record<string, unknown>;
    expect(out).toHaveProperty("score");
  });
  it("keeps contentChars:0 for an empty body but omits it when content is absent", () => {
    const empty = slimSearchHit({ ...hit, content: "" } as never, false) as Record<string, unknown>;
    expect(empty.contentChars).toBe(0);
    const absent = slimSearchHit({ ...hit, content: undefined } as never, false) as Record<
      string,
      unknown
    >;
    expect(absent).not.toHaveProperty("contentChars");
  });
});

describe("slimLatest", () => {
  const row = {
    id: "rel_l",
    title: "T",
    version: "@scope/p@1.0.0",
    publishedAt: "2026-05-22T00:00:00.000Z",
    sourceName: "S",
    sourceSlug: "s",
    summary: "sum",
    titleGenerated: null,
    titleShort: null,
    media: [],
    contentChars: 10,
    contentTokens: 3,
  } as never;
  it("slim keeps core + size, omits media, no excerpt (no content on wire)", () => {
    const out = slimLatest(row, false) as Record<string, unknown>;
    expect(out.source).toEqual({ slug: "s", name: "S" });
    expect(out).not.toHaveProperty("media");
    expect(out).not.toHaveProperty("excerpt");
    expect(out.contentTokens).toBe(3);
  });
});
