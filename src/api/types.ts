/**
 * API response types for the Releases registry.
 *
 * Wire protocol shapes are re-exported from `@buildinternet/releases-api-types`
 * (published from the monorepo `buildinternet/releases`, `packages/api-types/`);
 * bump the pin in `package.json` when adopting new response shapes.
 *
 * `EvaluationResult` stays local — it's returned by `/v1/evaluate` but the
 * monorepo defines it inside the private `@releases/ai-internal` package.
 * Upstream it into `@buildinternet/releases-api-types` later to remove the
 * duplicate.
 */
export * from "@buildinternet/releases-api-types";

export interface EvaluationResult {
  recommendedMethod: "feed" | "github" | "markdown" | "scrape" | "crawl";
  recommendedUrl: string;
  feedUrl?: string;
  feedType?: "rss" | "atom" | "jsonfeed";
  githubRepo?: string;
  pageStructure: "single-page" | "index" | "unknown";
  alternatives: Array<{ url: string; method: string; note: string }>;
  confidence: "high" | "medium" | "low";
  provider?: string;
  notes?: string;
}
