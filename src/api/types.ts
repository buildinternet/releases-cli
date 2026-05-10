/**
 * API response types for the Releases registry.
 *
 * Wire protocol shapes are re-exported from `@buildinternet/releases-api-types`
 * (published from the monorepo `buildinternet/releases`, `packages/api-types/`);
 * bump the pin in `package.json` when adopting new response shapes.
 */
export * from "@buildinternet/releases-api-types";

// Local overrides: strip deprecated aliases that will be removed in api-types 0.14.0
// (tracked in buildinternet/releases#866). Use the canonical field names instead.
import type { LatestRelease as _LatestRelease } from "@buildinternet/releases-api-types";
export type LatestRelease = Omit<
  _LatestRelease,
  "contentSummary" | "contentTitle" | "contentTitleShort"
>;
