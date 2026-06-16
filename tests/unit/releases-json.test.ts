import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ReleasesJsonConfigSchema } from "@buildinternet/releases-api-types";

// This repo dogfoods the owner-declared listing standard documented at
// https://releases.sh/docs/listing: the repo-root releases.json maps this
// source to the `cli` product, and the daily well-known sweep reads it from
// GitHub. Keep it schema-valid so it can't silently drift.
describe("releases.json (repo-root product mapping)", () => {
  const raw = readFileSync(join(import.meta.dir, "..", "..", "releases.json"), "utf8");

  it("is valid JSON and conforms to the published releases.json schema", () => {
    const parsed = JSON.parse(raw);
    expect(() => ReleasesJsonConfigSchema.parse(parsed)).not.toThrow();
  });

  it("declares the cli product", () => {
    const parsed = ReleasesJsonConfigSchema.parse(JSON.parse(raw));
    expect(parsed.$schema).toBe("https://releases.sh/schemas/releases.json");
    expect(parsed.product?.slug).toBe("cli");
  });
});
