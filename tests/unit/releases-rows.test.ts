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
    expect(lines[0]).toContain("Bump cli"); // title wins over summary (title-first)
    expect(lines[0]).toContain("rel_1");
    expect(lines[1].startsWith("PostHog ")).toBe(true); // plain version → source name
    expect(lines[1]).toContain("Agent skills v0.107.0"); // title
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

  it("skips the excerpt continuation when it just repeats the title", () => {
    const hit: ReleaseRow[] = [
      {
        id: "rel_r",
        title: "Better Webhooks, Better Service Settings",
        version: null,
        summary: "Better Webhooks, Better Service Settings",
        publishedAt: null,
        sourceName: "Railway",
        sourceSlug: "railway",
      },
    ];
    const out = stripAnsi(renderReleaseRows(hit, { mode: "search", isTTY: true, maxWidth: 100 }));
    expect(out.split("\n")).toHaveLength(1); // no redundant continuation line
  });

  it("collapses tabs/newlines in a search title so the row contract holds", () => {
    const hit: ReleaseRow[] = [
      {
        id: "rel_t",
        title: "Multi\nline\ttitle",
        version: null,
        summary: "body",
        publishedAt: null,
        sourceName: "Src",
        sourceSlug: "src",
      },
    ];
    // TSV: exactly one row, the title field free of raw tabs/newlines.
    const tsv = renderReleaseRows(hit, { mode: "search", isTTY: false });
    expect(tsv.split("\n")).toHaveLength(1);
    expect(tsv.split("\t")[2]).toBe("Multi line title");
    // TTY: the primary line carries the collapsed title (no embedded newline).
    const tty = stripAnsi(renderReleaseRows(hit, { mode: "search", isTTY: true, maxWidth: 100 }));
    expect(tty.split("\n")[0]).toContain("Multi line title");
  });

  it("prefixes the identity with the owning org (Org/Source) when the hit carries one", () => {
    const hit: ReleaseRow[] = [
      {
        id: "rel_o",
        title: "Custom webhooks",
        version: null,
        summary: "Axiom introduces custom webhooks.",
        publishedAt: null,
        sourceName: "Changelog",
        sourceSlug: "changelog",
        orgName: "Axiom",
        orgSlug: "axiom",
      },
    ];
    const tty = stripAnsi(renderReleaseRows(hit, { mode: "search", isTTY: true, maxWidth: 100 }));
    expect(tty.split("\n")[0].startsWith("Axiom/Changelog")).toBe(true);
    // Same coordinate leads the machine TSV identity column.
    const tsv = renderReleaseRows(hit, { mode: "search", isTTY: false });
    expect(tsv.split("\t")[1]).toBe("Axiom/Changelog");
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
