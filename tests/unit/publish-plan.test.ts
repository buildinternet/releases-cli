/**
 * Same fixtures and expectations as the publish-changelog Action
 * (buildinternet/releases tests/actions/publish-changelog.test.ts and
 * tests/actions/directory-plan.test.ts). Part of buildinternet/releases#2377.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "bun:test";
import {
  globBaseDir,
  isUnparsableChangelog,
  keyFromPath,
  planChangelogIngest,
  planDirectoryIngest,
  renderUrlTemplate,
  toBatchBody,
  type DirectoryFileInput,
} from "../../src/lib/changelog-publish/plan.js";

const FIXTURES = resolve(import.meta.dir, "../fixtures/publish");

function readFixture(relPath: string): string {
  return readFileSync(resolve(FIXTURES, relPath), "utf8");
}

const keepAChangelogBefore = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "- wip",
  "",
  "## [1.3.0] - 2026-04-01",
  "",
  "### Changed",
  "- tweaked defaults",
  "",
].join("\n");

const keepAChangelogAfter = [
  "# Changelog",
  "",
  "## [Unreleased]",
  "",
  "- wip",
  "",
  "## [1.4.0] - 2026-05-01",
  "",
  "### Added",
  "- new --json flag",
  "",
  "## [1.3.0] - 2026-04-01",
  "",
  "### Changed",
  "- tweaked defaults (hotfix)",
  "",
].join("\n");

const datedBefore = "# Changelog\n\n## June 9, 2026\n\n**Added**\n- A";
const datedAfter =
  "# Changelog\n\n## June 10, 2026\n\n**Added**\n- NEW\n\n## June 9, 2026\n\n**Added**\n- A EDITED";

const urlTemplate = "https://example.com/updates/{date}";

describe("planChangelogIngest — versioned Keep a Changelog", () => {
  test("maps added and modified sections to the /batch release shape", () => {
    const plan = planChangelogIngest(keepAChangelogBefore, keepAChangelogAfter, {
      urlTemplate: "https://github.com/acme/sdk/blob/main/CHANGELOG.md#{key}",
      changelogPath: "CHANGELOG.md",
    });
    expect(plan.format).toBe("keep-a-changelog");
    expect(plan.added).toEqual(["1.4.0"]);
    expect(plan.modified).toEqual(["1.3.0"]);
    expect(plan.releases).toHaveLength(2);

    const added = plan.releases.find((r) => r.key === "1.4.0");
    expect(added).toEqual({
      key: "1.4.0",
      title: "1.4.0",
      content: "### Added\n- new --json flag",
      url: "https://github.com/acme/sdk/blob/main/CHANGELOG.md#1.4.0",
      publishedAt: "2026-05-01T12:00:00Z",
      version: "1.4.0",
      type: "feature",
      prerelease: false,
    });

    const modified = plan.releases.find((r) => r.key === "1.3.0");
    expect(modified?.url).toBe("https://github.com/acme/sdk/blob/main/CHANGELOG.md#1.3.0");
    expect(modified?.content).toContain("hotfix");
  });

  test("keeps a heading permalink instead of the template", () => {
    const conventional = [
      "## [2.0.0](https://github.com/o/r/compare/v1.9.0...v2.0.0) (2026-05-10)",
      "",
      "### Features",
      "- big thing",
      "",
    ].join("\n");
    const plan = planChangelogIngest("", conventional, {
      urlTemplate: "https://unused.example/{key}",
    });
    expect(plan.format).toBe("conventional");
    expect(plan.releases[0]?.url).toBe("https://github.com/o/r/compare/v1.9.0...v2.0.0");
  });
});

describe("planChangelogIngest — date-sectioned (dogfood CHANGELOG.md)", () => {
  test("maps added/modified dates to rollup batch rows", () => {
    const plan = planChangelogIngest(datedBefore, datedAfter, { urlTemplate });
    expect(plan.format).toBe("date-sectioned");
    expect(plan.added).toEqual(["2026-06-10"]);
    expect(plan.modified).toEqual(["2026-06-09"]);
    expect(plan.releases.map((r) => r.url)).toEqual([
      "https://example.com/updates/2026-06-10",
      "https://example.com/updates/2026-06-09",
    ]);
    expect(plan.releases[0]).toMatchObject({
      title: "June 10, 2026",
      publishedAt: "2026-06-10T12:00:00Z",
      type: "rollup",
    });
  });

  test("re-planning the same after snapshot is a no-op (idempotent URLs)", () => {
    const first = planChangelogIngest(datedBefore, datedAfter, { urlTemplate });
    const replay = planChangelogIngest(datedAfter, datedAfter, { urlTemplate });
    expect(replay.added).toEqual([]);
    expect(replay.modified).toEqual([]);
    expect(replay.releases).toEqual([]);
    expect(first.releases.map((r) => r.url)).toEqual([
      "https://example.com/updates/2026-06-10",
      "https://example.com/updates/2026-06-09",
    ]);
  });
});

describe("planChangelogIngest — empty / unparsable", () => {
  test("identical files produce no releases", () => {
    const plan = planChangelogIngest(datedBefore, datedBefore, { urlTemplate });
    expect(plan.releases).toEqual([]);
  });

  test("empty before treats every section as added", () => {
    const plan = planChangelogIngest("", datedBefore, { urlTemplate });
    expect(plan.added).toEqual(["2026-06-09"]);
    expect(plan.modified).toEqual([]);
  });

  test("prose-only markdown is unparsable", () => {
    const md = "# Notes\n\n## Welcome\n\nHello.\n";
    expect(isUnparsableChangelog(md)).toBe(true);
    expect(planChangelogIngest("", md, { urlTemplate }).format).toBe("unknown");
  });
});

describe("renderUrlTemplate", () => {
  test("interpolates key, version, date, and path", () => {
    expect(
      renderUrlTemplate("https://x/{path}#{key}-{version}-{date}", {
        key: "1.0.0",
        version: "1.0.0",
        date: "2026-05-01",
        path: "docs/CHANGELOG.md",
      }),
    ).toBe("https://x/docs/CHANGELOG.md#1.0.0-1.0.0-2026-05-01");
  });

  test("interpolates {slug} as an alias for key", () => {
    expect(
      renderUrlTemplate("https://x/{path}#{slug}", {
        key: "a",
        version: "",
        date: "",
        path: "changelog/a.mdx",
      }),
    ).toBe("https://x/changelog/a.mdx#a");
  });
});

describe("toBatchBody", () => {
  test("drops the internal key and keeps the upsert fields", () => {
    const plan = planChangelogIngest(datedBefore, datedAfter, { urlTemplate });
    expect(toBatchBody(plan.releases)[0]).toEqual({
      title: "June 10, 2026",
      content: "**Added**\n- NEW",
      url: "https://example.com/updates/2026-06-10",
      publishedAt: "2026-06-10T12:00:00Z",
      version: null,
      type: "rollup",
      prerelease: false,
    });
    expect(toBatchBody(plan.releases)[0]).not.toHaveProperty("key");
  });
});

describe("globBaseDir", () => {
  test("static prefix before the first wildcard", () => {
    expect(globBaseDir("changelog/**/*.mdx")).toBe("changelog/");
    expect(globBaseDir("blog/*.mdx")).toBe("blog/");
    expect(globBaseDir("*.mdx")).toBe("");
    expect(globBaseDir("docs/changelog/entries/**/*.md")).toBe("docs/changelog/entries/");
  });
});

describe("keyFromPath", () => {
  test("strips the base dir and the extension", () => {
    expect(keyFromPath("changelog/2026-06-01.mdx", "changelog/")).toBe("2026-06-01");
    expect(keyFromPath("blog/2026-06-03-cool-thing/index.mdx", "blog/")).toBe(
      "2026-06-03-cool-thing/index",
    );
  });
});

const directoryUrl = "https://github.com/acme/site/blob/main/{path}";

describe("planDirectoryIngest — Mintlify-style fixtures", () => {
  test("flattens <Update>/<Callout> and strips the import line", () => {
    const files: DirectoryFileInput[] = [
      {
        path: "changelog/2026-06-01.mdx",
        status: "A",
        content: readFixture("mintlify/changelog/2026-06-01.mdx"),
      },
    ];
    const plan = planDirectoryIngest(files, {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    expect(plan.added).toEqual(["2026-06-01"]);
    expect(plan.modified).toEqual([]);
    expect(plan.deleted).toEqual([]);
    expect(plan.releases).toHaveLength(1);

    const release = plan.releases[0]!;
    expect(release.title).toBe("New JSON export");
    expect(release.publishedAt).toBe("2026-06-01T12:00:00Z");
    expect(release.url).toBe("https://github.com/acme/site/blob/main/changelog/2026-06-01.mdx");
    expect(release.content).not.toContain("import ");
    expect(release.content).not.toContain("<Update");
    expect(release.content).not.toContain("<Callout");
    expect(release.content).toContain("We added a JSON export option.");
    expect(release.content).toContain("Available on all plans.");
  });

  test("skips draft: true files entirely", () => {
    const files: DirectoryFileInput[] = [
      {
        path: "changelog/2026-06-04-draft.mdx",
        status: "A",
        content: readFixture("mintlify/changelog/2026-06-04-draft.mdx"),
      },
    ];
    const plan = planDirectoryIngest(files, {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    expect(plan.added).toEqual([]);
    expect(plan.releases).toEqual([]);
  });
});

describe("planDirectoryIngest — Fumadocs/Docusaurus-style fixtures", () => {
  test("uses frontmatter slug as the key and version from frontmatter", () => {
    const files: DirectoryFileInput[] = [
      {
        path: "changelog/foo.mdx",
        status: "M",
        content: readFixture("fumadocs/changelog/foo.mdx"),
      },
    ];
    const plan = planDirectoryIngest(files, {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    expect(plan.modified).toEqual(["foo-bar-release"]);
    expect(plan.added).toEqual([]);

    const release = plan.releases[0]!;
    expect(release.key).toBe("foo-bar-release");
    expect(release.version).toBe("1.2.0");
    expect(release.publishedAt).toBe("2026-06-02T12:00:00Z");
    expect(release.url).toBe("https://github.com/acme/site/blob/main/changelog/foo.mdx");
  });

  test("fenced code blocks are preserved verbatim", () => {
    const files: DirectoryFileInput[] = [
      {
        path: "changelog/foo.mdx",
        status: "A",
        content: readFixture("fumadocs/changelog/foo.mdx"),
      },
    ];
    const plan = planDirectoryIngest(files, {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    const release = plan.releases[0]!;
    expect(release.content).toContain("```ts");
    expect(release.content).toContain("<Callout>should not flatten</Callout>");
    expect(release.content).not.toContain("<Video");
  });

  test("frontmatter url wins over the url-template", () => {
    const files: DirectoryFileInput[] = [
      {
        path: "blog/2026-06-03-cool-thing/index.mdx",
        status: "A",
        content: readFixture("fumadocs/blog/2026-06-03-cool-thing/index.mdx"),
      },
    ];
    const plan = planDirectoryIngest(files, { urlTemplate: directoryUrl, glob: "blog/**/*.mdx" });
    const release = plan.releases[0]!;
    expect(release.key).toBe("cool-thing-shipped");
    expect(release.url).toBe("https://example.com/blog/cool-thing-shipped");
  });
});

describe("planDirectoryIngest — classification and idempotency", () => {
  const added: DirectoryFileInput = {
    path: "changelog/new.mdx",
    status: "A",
    content: "---\ntitle: New\ndate: 2026-06-05\n---\n\nBody A",
  };
  const modified: DirectoryFileInput = {
    path: "changelog/existing.mdx",
    status: "M",
    content: "---\ntitle: Existing\ndate: 2026-06-06\n---\n\nBody B",
  };
  const deletedFile: DirectoryFileInput = { path: "changelog/gone.mdx", status: "D" };

  test("classifies added/modified/deleted separately", () => {
    const plan = planDirectoryIngest([added, modified, deletedFile], {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    expect(plan.added).toEqual(["new"]);
    expect(plan.modified).toEqual(["existing"]);
    expect(plan.deleted).toEqual(["changelog/gone.mdx"]);
    expect(plan.releases.map((r) => r.key)).toEqual(["new", "existing"]);
  });

  test("renames land as a modified entry at the new path", () => {
    const renamed: DirectoryFileInput = {
      path: "changelog/renamed-new.mdx",
      status: "M",
      content: "---\ntitle: Renamed\ndate: 2026-06-07\n---\n\nBody C",
    };
    const plan = planDirectoryIngest([renamed], {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    expect(plan.modified).toEqual(["renamed-new"]);
    expect(plan.added).toEqual([]);
  });

  test("re-running the same input gives an identical batch body (stable key)", () => {
    const first = planDirectoryIngest([added, modified], {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    const replay = planDirectoryIngest([added, modified], {
      urlTemplate: directoryUrl,
      glob: "changelog/**/*.mdx",
    });
    expect(toBatchBody(first.releases)).toEqual(toBatchBody(replay.releases));
    expect(first.releases.map((r) => r.url)).toEqual(replay.releases.map((r) => r.url));
  });
});
