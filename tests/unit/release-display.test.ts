import { describe, expect, it } from "bun:test";
import { relativeDate, cleanExcerpt } from "../../src/lib/release-display.js";

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
