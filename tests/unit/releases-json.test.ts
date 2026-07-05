import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReleasesJsonConfigSchema } from "@buildinternet/releases-api-types";

// This repo dogfoods the owner-declared manifest documented at
// https://releases.sh/docs/listing: the repo-root releases.json (v2) binds this
// repo to the `cli` product and declares its release locator, and the daily
// well-known sweep reads it from GitHub. Keep it schema-valid so it can't
// silently drift.
describe("releases.json (repo-root product mapping)", () => {
  const raw = readFileSync(join(import.meta.dir, "..", "..", "releases.json"), "utf8");

  it("is valid JSON and conforms to the published releases.json schema", () => {
    const parsed = JSON.parse(raw);
    expect(() => ReleasesJsonConfigSchema.parse(parsed)).not.toThrow();
  });

  it("declares the cli product and its release locator", () => {
    const parsed = ReleasesJsonConfigSchema.parse(JSON.parse(raw));
    expect(parsed.$schema).toBe("https://releases.sh/schemas/releases.json");
    expect(parsed.version).toBe(2);
    if (!("product" in parsed)) throw new Error("expected repo-scoped manifest");
    expect(parsed.product?.slug).toBe("cli");
    expect(parsed.releases?.[0]?.github).toBe("self");
  });
});
