import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import chalk from "chalk";
import { renderReleaseRows } from "../../src/cli/render/releases-table.js";
import { stripAnsi } from "../../src/lib/sanitize.js";
import type { ReleaseRow } from "../../src/lib/release-display.js";

const rows: ReleaseRow[] = [
  {
    id: "rel_1",
    title: "Bump cli",
    version: "@posthog/nuxt@1.7.42",
    summary: "Bump @posthog/cli to 0.7.13",
    publishedAt: null,
    sourceName: "PostHog JS",
    sourceSlug: "posthog-js",
  },
  {
    id: "rel_2",
    title: "Agent skills v0.107.0",
    version: "agent-skills-v0.107.0",
    summary: null,
    publishedAt: null,
    sourceName: "PostHog",
    sourceSlug: "posthog",
  },
];

describe("renderReleaseRows (feed)", () => {
  beforeAll(() => {
    chalk.level = 1;
  });
  afterAll(() => {
    chalk.level = 0;
  });

  it("TTY: one aligned row per release, identity from version-or-source, no header", () => {
    const out = stripAnsi(renderReleaseRows(rows, { mode: "feed", isTTY: true, maxWidth: 100 }));
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].startsWith("@posthog/nuxt@1.7.42")).toBe(true);
    expect(lines[0]).toContain("Bump @posthog/cli to 0.7.13");
    expect(lines[0]).toContain("rel_1");
    expect(lines[1].startsWith("PostHog ")).toBe(true); // plain version → source name
    expect(lines[1]).toContain("Agent skills v0.107.0"); // summary null → title fallback
  });

  it("non-TTY: clean TSV, one row per release, no injected newline", () => {
    const out = renderReleaseRows(rows, { mode: "feed", isTTY: false });
    const lines = out.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0].split("\t")[0]).toBe("rel_1");
  });
});

describe("renderReleaseRows (search)", () => {
  beforeAll(() => {
    chalk.level = 1;
  });
  afterAll(() => {
    chalk.level = 0;
  });

  it("TTY: title on the primary line, cleaned excerpt as an indented continuation", () => {
    const hit: ReleaseRow[] = [
      {
        id: "rel_e",
        title: "LangSmith now supports MCP",
        version: null,
        summary: "## Trace\n**MCP** tool calls end-to-end",
        publishedAt: null,
        sourceName: "LangChain",
        sourceSlug: "langchain-changelog",
      },
    ];
    const out = stripAnsi(renderReleaseRows(hit, { mode: "search", isTTY: true, maxWidth: 100 }));
    const lines = out.split("\n");
    expect(lines[0]).toContain("LangChain");
    expect(lines[0]).toContain("LangSmith now supports MCP");
    expect(lines[1].trimStart()).toBe("Trace MCP tool calls end-to-end");
    expect(lines[1].startsWith(" ")).toBe(true); // indented continuation
  });

  it("non-TTY: one plain line per hit, no continuation", () => {
    const hit: ReleaseRow[] = [
      {
        id: "rel_e",
        title: "T",
        version: null,
        summary: "body",
        publishedAt: null,
        sourceName: "Lang",
        sourceSlug: "lang",
      },
    ];
    const out = renderReleaseRows(hit, { mode: "search", isTTY: false });
    expect(out.split("\n")).toHaveLength(1);
  });
});
