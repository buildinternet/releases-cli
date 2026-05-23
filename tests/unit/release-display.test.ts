import { describe, expect, it } from "bun:test";
import {
  relativeDate,
  humanDate,
  cleanExcerpt,
  releaseIdentity,
  releaseDescription,
} from "../../src/lib/release-display.js";

describe("relativeDate", () => {
  const now = new Date("2026-05-22T12:00:00.000Z").getTime();
  it("returns empty string for null/undefined/unparseable", () => {
    expect(relativeDate(null)).toBe("");
    expect(relativeDate(undefined)).toBe("");
    expect(relativeDate("not-a-date")).toBe("");
  });
  it("buckets by magnitude", () => {
    expect(relativeDate(new Date(now - 30 * 1000).toISOString(), now)).toBe("now");
    expect(relativeDate(new Date(now - 5 * 60 * 1000).toISOString(), now)).toBe("5m");
    expect(relativeDate(new Date(now - 3 * 3600 * 1000).toISOString(), now)).toBe("3h");
    expect(relativeDate(new Date(now - 2 * 86400 * 1000).toISOString(), now)).toBe("2d");
    expect(relativeDate(new Date(now - 21 * 86400 * 1000).toISOString(), now)).toBe("3w");
    expect(relativeDate(new Date(now - 90 * 86400 * 1000).toISOString(), now)).toBe("3mo");
    expect(relativeDate(new Date(now - 800 * 86400 * 1000).toISOString(), now)).toBe("2y");
  });
});

describe("humanDate", () => {
  it("returns empty string for null/undefined/unparseable", () => {
    expect(humanDate(null)).toBe("");
    expect(humanDate(undefined)).toBe("");
    expect(humanDate("not-a-date")).toBe("");
  });
  it("formats as `Mon D, YYYY` in UTC", () => {
    expect(humanDate("2024-07-22T00:00:00.000Z")).toBe("Jul 22, 2024");
    // Midnight-UTC date renders the same calendar day regardless of runner TZ.
    expect(humanDate("2026-01-01T00:00:00.000Z")).toBe("Jan 1, 2026");
  });
});

describe("cleanExcerpt", () => {
  it("returns empty string for empty/null", () => {
    expect(cleanExcerpt(null)).toBe("");
    expect(cleanExcerpt("   ")).toBe("");
  });
  it("strips markdown and collapses whitespace", () => {
    const md =
      "## Chat API\n\n### Feature\n\n**Developer Preview**: The [MCP](https://x) server is _now_ available.";
    expect(cleanExcerpt(md)).toBe(
      "Chat API Feature Developer Preview: The MCP server is now available.",
    );
  });
  it("strips fenced code and truncates with ellipsis", () => {
    const md = "Intro text\n```ts\nconst x = 1;\n```\nmore";
    expect(cleanExcerpt(md, 12)).toBe("Intro text…");
  });
});

describe("releaseIdentity", () => {
  it("uses version when package-qualified (@ or /)", () => {
    expect(releaseIdentity({ version: "@ai-sdk/google@3.0.79", sourceName: "AI SDK" })).toBe(
      "@ai-sdk/google@3.0.79",
    );
    expect(releaseIdentity({ version: "vercel@54.4.0", sourceName: "Vercel CLI" })).toBe(
      "vercel@54.4.0",
    );
  });
  it("falls back to source name for plain/empty versions", () => {
    expect(releaseIdentity({ version: "agent-skills-v0.107.0", sourceName: "PostHog" })).toBe(
      "PostHog",
    );
    expect(releaseIdentity({ version: "v1.2.3", sourceName: "Render Blog" })).toBe("Render Blog");
    expect(releaseIdentity({ version: null, sourceName: "LangChain" })).toBe("LangChain");
  });
  it("prefixes the owning org as `Org/Source` when orgName is supplied", () => {
    expect(releaseIdentity({ version: null, sourceName: "Changelog", orgName: "Axiom" })).toBe(
      "Axiom/Changelog",
    );
  });
  it("skips the org prefix when the source name already starts with the org name", () => {
    expect(
      releaseIdentity({ version: null, sourceName: "Resend Changelog", orgName: "Resend" }),
    ).toBe("Resend Changelog");
    // Case-insensitive match.
    expect(releaseIdentity({ version: null, sourceName: "vercel blog", orgName: "Vercel" })).toBe(
      "vercel blog",
    );
  });
  it("keeps a package-qualified version even when orgName is present", () => {
    expect(
      releaseIdentity({ version: "next@15.0.0", sourceName: "Next.js", orgName: "Vercel" }),
    ).toBe("next@15.0.0");
  });
});

describe("releaseDescription", () => {
  const base = {
    id: "rel_x",
    title: "Raw Title",
    version: null,
    summary: null,
    publishedAt: null,
    sourceName: "S",
    sourceSlug: "s",
  };
  it("prefers summary, cleaned", () => {
    expect(releaseDescription({ ...base, summary: "**Bold** summary" })).toBe("Bold summary");
  });
  it("falls back through titleShort → titleGenerated → content excerpt → title", () => {
    expect(releaseDescription({ ...base, titleShort: "Short" })).toBe("Short");
    expect(releaseDescription({ ...base, titleGenerated: "Generated" })).toBe("Generated");
    expect(releaseDescription({ ...base, content: "## Heading\nbody text" })).toBe(
      "Heading body text",
    );
    expect(releaseDescription({ ...base })).toBe("Raw Title");
  });
});
