import { describe, it, expect } from "bun:test";
import { daysAgoIso } from "@buildinternet/releases-core/dates";
import { formatOverviewFreshnessLine } from "../../src/cli/commands/admin/overview.js";

describe("overview freshness line", () => {
  it("keeps the generated-only label when the overview has not been amended", () => {
    const generatedAt = new Date().toISOString();

    const line = formatOverviewFreshnessLine({
      generatedAt,
      updatedAt: generatedAt,
      releaseCount: 10,
    });

    expect(line).toBe("generated just now · 10 releases contributing");
  });

  it("keeps the citation count when freshness details are formatted", () => {
    const generatedAt = new Date().toISOString();

    const line = formatOverviewFreshnessLine({
      generatedAt,
      updatedAt: generatedAt,
      releaseCount: 10,
      citationCount: 2,
    });

    expect(line).toBe("generated just now · 10 releases contributing · 2 citations");
  });

  it("surfaces updated freshness when an amended overview has an older generation time", () => {
    const line = formatOverviewFreshnessLine({
      generatedAt: daysAgoIso(12),
      updatedAt: new Date().toISOString(),
      releaseCount: 10,
    });

    expect(line).toBe("updated just now · generated 12d ago · 10 releases contributing");
  });
});
