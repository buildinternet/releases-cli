import { getApiUrl, getApiKey, isAdminMode } from "../lib/mode.js";
import { logger } from "@releases/lib/logger";
import { daysAgoIso } from "@buildinternet/releases-core/dates";
import { RELEASES_CLI_UA } from "../lib/user-agent.js";
import type {
  Source,
  Release,
  Organization,
  OrgAccount,
  IgnoredUrl,
  BlockedUrl,
  ReleaseSummary,
  NewReleaseSummary,
  Product,
  Tag,
  KnowledgePage,
  ReleaseType,
} from "@buildinternet/releases-core/schema";
import type {
  SourceWithOrg,
  Stats,
  UnifiedSearchResponse,
  SourceChangelogResponse,
  ReleaseWithSource,
  StatsSummary,
  FetchLogEntry,
  LatestRelease,
  UsageStatsResponse,
  Session,
  EmbedBackfillResponse,
  EmbedStatusResponse,
  EvaluationResult,
  MediaItem,
  OrgDependentsResponse,
} from "./types.js";
import type { ListResponse } from "@buildinternet/releases-core/cli-contracts";
import type {
  DomainLookupResponse,
  OverviewInputsCheck,
  OverviewManifestResponse,
  OverviewManifestRow,
  OverviewPlanAction,
  OverviewStaleness,
  CollectionListItem,
  CollectionDetail,
  CollectionMemberInput,
  CollectionRow,
  CreateCollectionRequest,
  UpdateCollectionRequest,
  ReplaceCollectionMembersRequest,
  AddCollectionMemberRequest,
} from "@buildinternet/releases-api-types";
export type {
  DomainLookupResponse,
  OverviewInputsCheck,
  OverviewManifestResponse,
  OverviewManifestRow,
  OverviewPlanAction,
  OverviewStaleness,
  CollectionListItem,
  CollectionDetail,
  CollectionMemberInput,
  CollectionRow,
};
export type {
  SourceWithOrg,
  SourcePatchInput,
  ReleaseWithSource,
  StatsSummary,
  FetchLogEntry,
  LatestRelease,
  UsageBreakdownRow,
  UsageStatsResponse,
  Session,
  EmbedBackfillResponse,
  EmbedStatusResponse,
  EvaluationResult,
  Stats,
  SourceListItem,
  OrgDependentsResponse,
} from "./types.js";

export async function apiFetch<T>(path: string, opts?: RequestInit): Promise<T> {
  const url = `${getApiUrl()}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "User-Agent": RELEASES_CLI_UA,
    ...(opts?.headers as Record<string, string>),
  };
  // Only send auth header when an API key is configured (admin mode)
  if (isAdminMode()) {
    headers["Authorization"] = `Bearer ${getApiKey()}`;
  }
  const res = await fetch(url, {
    ...opts,
    headers,
  });

  if (res.status === 404 && (!opts?.method || opts.method === "GET")) return null as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = (body as { message?: string }).message ?? res.statusText;
    throw new Error(`API error (${res.status}) on ${opts?.method ?? "GET"} ${path}: ${message}`);
  }

  return res.json();
}

// ── Source queries ──

/**
 * Resolves an operator-supplied source identifier to a `{ orgSlug, sourceSlug }`
 * pair the API can match without ambiguity. Accepts:
 *
 *   - `src_…` typed IDs: pass straight through; the bare API path still
 *     accepts globally-unique IDs.
 *   - `org/slug` coordinates: split locally; the API takes the org-scoped
 *     pair directly.
 *   - bare slugs: round-trip through `GET /v1/lookups/source-by-slug` to
 *     pick the canonical org for the slug. The lookup endpoint returns the
 *     oldest match so repeated calls land on the same row when a slug
 *     exists under multiple orgs (a side effect of #690 per-org slug
 *     uniqueness).
 *
 * Returns `null` when no matching source exists. Throws on API errors.
 */
async function resolveSourceTarget(
  identifier: string,
): Promise<{ pathSegment: string; sourceId: string } | null> {
  if (identifier.startsWith("src_")) {
    return { pathSegment: `/v1/sources/${encodeURIComponent(identifier)}`, sourceId: identifier };
  }
  const slash = identifier.indexOf("/");
  if (slash > 0 && slash < identifier.length - 1) {
    const orgSlug = identifier.slice(0, slash);
    const sourceSlug = identifier.slice(slash + 1);
    return {
      pathSegment: `/v1/orgs/${encodeURIComponent(orgSlug)}/sources/${encodeURIComponent(sourceSlug)}`,
      sourceId: "", // unknown until we hydrate via findSource — callers that need the ID re-read source.id from the result
    };
  }
  // Bare slug — bounce through the lookup resolver to get an unambiguous home.
  const resolved = await apiFetch<{
    sourceId: string;
    sourceSlug: string;
    orgSlug: string;
  } | null>(`/v1/lookups/source-by-slug?slug=${encodeURIComponent(identifier)}`);
  if (!resolved) return null;
  return {
    pathSegment: `/v1/orgs/${encodeURIComponent(resolved.orgSlug)}/sources/${encodeURIComponent(resolved.sourceSlug)}`,
    sourceId: resolved.sourceId,
  };
}

export async function findSource(identifier: string): Promise<Source | null> {
  // API returns enriched data — extra fields are harmlessly ignored by callers expecting Source
  const target = await resolveSourceTarget(identifier);
  if (!target) return null;
  return apiFetch<Source | null>(target.pathSegment);
}

export async function sourceChangelog(
  identifier: string,
  range?: { path?: string; offset?: number; limit?: number; tokens?: number },
): Promise<SourceChangelogResponse | null> {
  const target = await resolveSourceTarget(identifier);
  if (!target) return null;
  const params = new URLSearchParams();
  if (range?.path !== undefined) params.set("path", range.path);
  if (range?.offset !== undefined) params.set("offset", String(range.offset));
  if (range?.limit !== undefined) params.set("limit", String(range.limit));
  if (range?.tokens !== undefined) params.set("tokens", String(range.tokens));
  const qs = params.toString();
  return apiFetch<SourceChangelogResponse | null>(
    `${target.pathSegment}/changelog${qs ? `?${qs}` : ""}`,
  );
}

export async function findSourcesByUrls(urls: string[]): Promise<Source[]> {
  if (urls.length === 0) return [];
  const params = urls.map((u) => `url=${encodeURIComponent(u)}`).join("&");
  return apiFetch<Source[]>(`/v1/sources?filterByUrls=true&${params}`);
}

// ── Org queries ──

export async function findOrg(identifier: string): Promise<Organization | null> {
  return apiFetch<Organization | null>(`/v1/orgs/${encodeURIComponent(identifier)}`);
}

async function suggestEntities(
  endpoint: string,
  term: string,
  limit: number,
): Promise<Array<{ slug: string; name: string }>> {
  type Row = { slug: string; name: string };
  // /v1/orgs always returns a paginated envelope (#723); /v1/sources is bare
  // unless ?envelope=true. Accept either shape so this helper stays valid as
  // more list endpoints adopt always-envelope.
  const raw = (await apiFetch<Row[] | ListResponse<Row>>(`${endpoint}?limit=200`)) ?? ([] as Row[]);
  const all: Row[] = Array.isArray(raw) ? raw : raw.items;
  const lower = term.toLowerCase();
  return all
    .filter((e) => e.slug.includes(lower) || e.name.toLowerCase().includes(lower))
    .slice(0, limit);
}

export const suggestOrgs = (term: string, limit: number) =>
  suggestEntities("/v1/orgs", term, limit);
export const suggestSources = (term: string, limit: number) =>
  suggestEntities("/v1/sources", term, limit);

export async function getSourcesByOrg(orgId: string): Promise<Source[]> {
  return apiFetch<Source[]>(`/v1/sources?orgId=${orgId}`);
}

export async function listOrgs(opts?: {
  query?: string;
  platform?: string;
  limit?: number;
  page?: number;
}): Promise<ListResponse<Organization>> {
  const params = new URLSearchParams();
  if (opts?.query) params.set("q", opts.query);
  if (opts?.platform) params.set("platform", opts.platform);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  const qs = params.toString();
  return apiFetch<ListResponse<Organization>>(`/v1/orgs${qs ? `?${qs}` : ""}`);
}

export async function getOrgAccountByPlatform(
  orgId: string,
  platform: string,
): Promise<OrgAccount | null> {
  return apiFetch<OrgAccount | null>(`/v1/orgs/${orgId}/accounts?platform=${platform}`);
}

// ── Ignored URLs (org-scoped) ──

export async function findIgnoredUrl(url: string, orgId: string): Promise<IgnoredUrl | null> {
  const encoded = encodeURIComponent(url);
  return apiFetch<IgnoredUrl | null>(`/v1/orgs/${orgId}/ignored-urls?url=${encoded}&single=true`);
}

export async function addIgnoredUrl(url: string, orgId: string, reason?: string): Promise<void> {
  await apiFetch(`/v1/orgs/${orgId}/ignored-urls`, {
    method: "POST",
    body: JSON.stringify({ url, reason }),
  });
}

export async function listIgnoredUrls(
  orgId: string,
  opts?: { limit?: number; page?: number },
): Promise<ListResponse<IgnoredUrl>> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  const qs = params.toString();
  return apiFetch<ListResponse<IgnoredUrl>>(`/v1/orgs/${orgId}/ignored-urls${qs ? `?${qs}` : ""}`);
}

export async function removeIgnoredUrl(url: string, orgId: string): Promise<void> {
  await apiFetch(`/v1/orgs/${orgId}/ignored-urls/${encodeURIComponent(url)}`, { method: "DELETE" });
}

// ── Blocked URLs (global) ──

export async function findBlockedUrl(url: string): Promise<BlockedUrl | null> {
  const encoded = encodeURIComponent(url);
  return apiFetch<BlockedUrl | null>(`/v1/admin/blocklist?url=${encoded}&single=true`);
}

export async function addBlockedUrl(
  pattern: string,
  type: "exact" | "domain",
  reason?: string,
): Promise<void> {
  await apiFetch("/v1/admin/blocklist", {
    method: "POST",
    body: JSON.stringify({ pattern, type, reason }),
  });
}

export async function listBlockedUrls(opts?: {
  limit?: number;
  page?: number;
}): Promise<ListResponse<BlockedUrl>> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  const qs = params.toString();
  return apiFetch<ListResponse<BlockedUrl>>(`/v1/admin/blocklist${qs ? `?${qs}` : ""}`);
}

export async function removeBlockedUrl(pattern: string): Promise<void> {
  await apiFetch(`/v1/admin/blocklist/${encodeURIComponent(pattern)}`, { method: "DELETE" });
}

// ── Release CRUD ──

export async function getRelease(id: string): Promise<ReleaseWithSource | null> {
  return apiFetch<ReleaseWithSource | null>(`/v1/releases/${id}`);
}

export async function deleteRelease(id: string): Promise<boolean> {
  const result = await apiFetch<{ deleted: boolean } | null>(`/v1/releases/${id}`, {
    method: "DELETE",
  });
  return result?.deleted ?? false;
}

export async function updateRelease(
  id: string,
  data: Record<string, unknown>,
): Promise<ReleaseWithSource> {
  return apiFetch<ReleaseWithSource>(`/v1/releases/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

// ── Release suppression ──

export async function suppressRelease(releaseId: string, reason?: string): Promise<boolean> {
  const result = await apiFetch<{ suppressed: boolean }>(`/v1/releases/${releaseId}/suppress`, {
    method: "POST",
    body: JSON.stringify({ reason }),
  });
  return result?.suppressed ?? false;
}

export async function unsuppressRelease(releaseId: string): Promise<boolean> {
  const result = await apiFetch<{ unsuppressed: boolean }>(`/v1/releases/${releaseId}/unsuppress`, {
    method: "POST",
  });
  return result?.unsuppressed ?? false;
}

// ── Content hash ──

export async function checkContentHash(source: Source, contentHash: string): Promise<boolean> {
  // Use the stable typed ID — slug-form bare paths return 400 after #698.
  const result = await apiFetch<{ unchanged: boolean } | null>(
    `/v1/sources/${encodeURIComponent(source.id)}/content-hash`,
    {
      method: "POST",
      body: JSON.stringify({ contentHash }),
    },
  );
  return result?.unchanged ?? false;
}

// ── Search ──

export async function unifiedSearch(
  query: string,
  limit: number,
  opts?: {
    org?: string;
    domain?: string;
    mode?: "lexical" | "semantic" | "hybrid";
  },
): Promise<UnifiedSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (opts?.org) params.set("org", opts.org);
  if (opts?.domain) params.set("domain", opts.domain);
  if (opts?.mode) params.set("mode", opts.mode);
  return apiFetch<UnifiedSearchResponse>(`/v1/search?${params}`);
}

// ── Domain lookup ──

export async function lookupDomain(domain: string): Promise<DomainLookupResponse | null> {
  return apiFetch<DomainLookupResponse | null>(
    `/v1/lookups/by-domain?domain=${encodeURIComponent(domain)}`,
  );
}

// ── List sources with org ──

type ListSourcesOpts = {
  orgSlug?: string;
  productSlug?: string;
  hasFeed?: boolean;
  query?: string;
  includeHidden?: boolean;
  category?: string;
  limit?: number;
  page?: number;
};

export async function listSourcesWithOrg(opts?: ListSourcesOpts): Promise<SourceWithOrg[]>;
export async function listSourcesWithOrg(
  opts: ListSourcesOpts & { envelope: true },
): Promise<ListResponse<SourceWithOrg>>;
export async function listSourcesWithOrg(
  opts?: ListSourcesOpts & { envelope?: boolean },
): Promise<SourceWithOrg[] | ListResponse<SourceWithOrg>> {
  const params = new URLSearchParams();
  if (opts?.orgSlug) params.set("orgSlug", opts.orgSlug);
  if (opts?.productSlug) params.set("productSlug", opts.productSlug);
  if (opts?.hasFeed) params.set("has_feed", "true");
  if (opts?.query) params.set("query", opts.query);
  if (opts?.includeHidden) params.set("include_hidden", "true");
  if (opts?.category) params.set("category", opts.category);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  if (opts?.envelope) params.set("envelope", "true");
  const qs = params.toString();

  return apiFetch<SourceWithOrg[] | ListResponse<SourceWithOrg>>(
    `/v1/sources${qs ? `?${qs}` : ""}`,
  );
}

// ── Stats ──

export async function getStatsSummary(days: number): Promise<StatsSummary> {
  const cutoff = daysAgoIso(days);

  // Compose from existing endpoints
  const [statsData, fetchLogData, sourcesData] = await Promise.all([
    apiFetch<Stats>("/v1/stats"),
    apiFetch<
      Array<{
        id: string;
        sourceId: string;
        releasesFound: number;
        releasesInserted: number;
        durationMs: number | null;
        status: string;
        error: string | null;
        createdAt: string;
      }>
    >("/v1/admin/logs/fetch?limit=20"),
    apiFetch<
      Array<{
        slug: string;
        name: string;
        type: string;
        url: string;
        orgSlug: string | null;
        releaseCount: number;
      }>
    >("/v1/sources"),
  ]);

  return {
    period: { days, cutoff },
    totals: {
      organizations: statsData.orgs,
      sources: statsData.sources,
      releases: statsData.releases,
      releasesInPeriod: 0, // Not available from basic stats endpoint
    },
    sourceHealth: {
      upToDate: 0,
      stale: 0,
      neverFetched: 0,
    },
    sourceActivity: sourcesData.map((s) => ({
      sourceName: s.name,
      sourceSlug: s.slug,
      sourceType: s.type,
      orgName: s.orgSlug,
      lastFetchedAt: null,
      totalReleases: s.releaseCount,
      recentReleases: 0,
    })),
    recentActivity: fetchLogData.map((f) => ({
      sourceName: "",
      sourceSlug: "",
      orgName: null,
      releasesFound: f.releasesFound,
      releasesInserted: f.releasesInserted,
      totalReleases: 0,
      status: f.status,
      durationMs: f.durationMs,
      error: f.error,
      createdAt: f.createdAt,
    })),
  };
}

// ── Usage log ──

export async function getUsageStats(days: number): Promise<UsageStatsResponse> {
  return apiFetch<UsageStatsResponse>(`/v1/admin/logs/usage/stats?days=${days}`);
}

export async function postUsageLog(entry: {
  operation: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  sourceSlug?: string | null;
  releaseCount?: number | null;
}): Promise<void> {
  await apiFetch("/v1/admin/logs/usage", {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

// ── Fetch log write ──

export async function postFetchLog(entry: {
  sourceId: string;
  releasesFound: number;
  releasesInserted: number;
  durationMs?: number | null;
  status: "success" | "error" | "no_change" | "dry_run";
  error?: string | null;
  rawContent?: string | null;
  sessionId?: string | null;
}): Promise<void> {
  await apiFetch("/v1/admin/logs/fetch", {
    method: "POST",
    body: JSON.stringify(entry),
  });
}

// ── Fetch log read ──

export async function getFetchLogs(opts: {
  /** Source identifier (src_… or slug). */
  source?: string;
  limit: number;
}): Promise<FetchLogEntry[]> {
  const params = new URLSearchParams({ limit: String(opts.limit) });
  if (opts.source) params.set("source", opts.source);
  const logs = await apiFetch<
    Array<{
      id: string;
      sourceId: string;
      releasesFound: number;
      releasesInserted: number;
      durationMs: number | null;
      status: string;
      error: string | null;
      rawContent: string | null;
      createdAt: string;
    }>
  >(`/v1/admin/logs/fetch?${params}`);

  // The API fetch-log endpoint returns raw fetch_log rows without source name/slug.
  // In remote mode we don't have the join data, so we provide what we can.
  return logs.map((l) => ({
    id: l.id,
    sourceName: "",
    sourceSlug: "",
    status: l.status,
    releasesFound: l.releasesFound,
    releasesInserted: l.releasesInserted,
    durationMs: l.durationMs,
    error: l.error,
    createdAt: l.createdAt,
  }));
}

// ── Latest releases ──

function toMediaItems(
  raw: Array<{ type: string; url: string; alt?: string; r2Url?: string }> | undefined,
): MediaItem[] {
  return (raw ?? []).map((m) => ({
    type: m.type as MediaItem["type"],
    url: m.url,
    alt: m.alt,
    r2Url: m.r2Url,
  }));
}

type LatestReleasesResponse = {
  releases: Array<{
    id: string;
    version: string | null;
    type: string;
    title: string;
    summary: string | null;
    publishedAt: string | null;
    url: string | null;
    media: Array<{ type: string; url: string; alt?: string; r2Url?: string }>;
    source: { slug: string; name: string; type: string };
  }>;
};

export async function getLatestReleases(opts: {
  /** Source identifier (src_… or slug). */
  source?: string;
  /** Organization identifier (org_… or slug). */
  org?: string;
  count: number;
  includeCoverage?: boolean;
}): Promise<LatestRelease[]> {
  const qs = new URLSearchParams();
  qs.set("count", String(opts.count));
  if (opts.source) qs.set("source", opts.source);
  if (opts.org) qs.set("org", opts.org);
  if (opts.includeCoverage) qs.set("include_coverage", "true");

  const data = await apiFetch<LatestReleasesResponse>(`/v1/releases/latest?${qs.toString()}`);
  if (!data) return [];
  return data.releases.map((r) => ({
    id: r.id,
    title: r.title,
    version: r.version,
    publishedAt: r.publishedAt,
    sourceName: r.source.name,
    sourceSlug: r.source.slug,
    contentSummary: r.summary ?? null,
    media: toMediaItems(r.media),
  }));
}

// ── Known releases for incremental parsing ──

export async function getKnownReleasesForSource(
  sourceIdentifier: string,
  limit: number,
): Promise<Array<{ version: string | null; title: string; publishedAt: string | null }>> {
  const target = await resolveSourceTarget(sourceIdentifier);
  if (!target) return [];
  const data = await apiFetch<
    Array<{ version: string | null; title: string; publishedAt: string | null }>
  >(`${target.pathSegment}/known-releases?limit=${limit}`);
  return data ?? [];
}

// ── Fetchable sources ──

export async function listFetchableSources(opts: {
  mode: "all" | "unfetched" | "stale" | "retry_errors";
  staleHours?: number;
}): Promise<Source[]> {
  const params = new URLSearchParams({ mode: opts.mode });
  if (opts.staleHours) params.set("staleHours", String(opts.staleHours));
  return apiFetch<Source[]>(`/v1/sources/fetchable?${params}`);
}

export async function listFeedSources(): Promise<Source[]> {
  return apiFetch<Source[]>("/v1/sources/feeds");
}

export async function listSourcesWithChanges(): Promise<Source[]> {
  return apiFetch<Source[]>("/v1/sources/changes");
}

// ── Source CRUD ──

export async function updateSource(
  source: Pick<Source, "id">,
  data: Record<string, unknown>,
): Promise<Source> {
  return apiFetch<Source>(`/v1/sources/${encodeURIComponent(source.id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteSource(source: Pick<Source, "id">): Promise<void> {
  await apiFetch(`/v1/sources/${encodeURIComponent(source.id)}`, { method: "DELETE" });
}

export async function insertReleasesBatch(
  source: Pick<Source, "id">,
  releaseRows: Array<{
    version?: string | null;
    title: string;
    content: string;
    url?: string | null;
    contentHash?: string | null;
    publishedAt?: string | null;
    type?: ReleaseType;
  }>,
): Promise<{ inserted: number; total: number }> {
  const chunks: (typeof releaseRows)[] = [];
  for (let i = 0; i < releaseRows.length; i += 5) {
    chunks.push(releaseRows.slice(i, i + 5));
  }
  const path = `/v1/sources/${encodeURIComponent(source.id)}/releases/batch`;
  const settled = await Promise.allSettled(
    chunks.map((chunk) =>
      apiFetch<{ inserted: number; total: number }>(path, {
        method: "POST",
        body: JSON.stringify({ releases: chunk }),
      }),
    ),
  );

  const succeeded = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failures = settled.flatMap((r) => (r.status === "rejected" ? [r.reason] : []));

  if (succeeded.length === 0 && failures.length > 0) {
    throw failures[0];
  }

  if (failures.length > 0) {
    logger.warn(
      `insertReleasesBatch(${source.id}): ${failures.length}/${chunks.length} chunk(s) failed — ${failures.map(String).join("; ")}`,
    );
  }

  const inserted = succeeded.reduce((sum, r) => sum + r.inserted, 0);
  const total = succeeded[succeeded.length - 1]?.total ?? 0;
  return { inserted, total };
}

export async function deleteReleasesForSource(
  source: Pick<Source, "id">,
): Promise<{ deleted: number }> {
  return apiFetch(`/v1/sources/${encodeURIComponent(source.id)}/releases`, { method: "DELETE" });
}

export async function createSource(data: {
  name: string;
  slug: string;
  type: string;
  url: string;
  orgId?: string | null;
  productId?: string | null;
  metadata?: string;
}): Promise<Source> {
  return apiFetch<Source>("/v1/sources", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// ── Org CRUD ──

export async function createOrg(
  name: string,
  opts?: {
    slug?: string;
    domain?: string;
    description?: string;
    category?: string;
    avatarUrl?: string;
  },
): Promise<Organization> {
  return apiFetch<Organization>("/v1/orgs", {
    method: "POST",
    body: JSON.stringify({
      name,
      slug: opts?.slug,
      domain: opts?.domain,
      description: opts?.description,
      category: opts?.category,
      avatarUrl: opts?.avatarUrl,
    }),
  });
}

export async function removeOrg(identifier: string, opts?: { hard?: boolean }): Promise<void> {
  const qs = opts?.hard ? "?hard=true" : "";
  await apiFetch(`/v1/orgs/${encodeURIComponent(identifier)}${qs}`, { method: "DELETE" });
}

export async function getOrgDependents(identifier: string): Promise<OrgDependentsResponse> {
  // apiFetch returns null on GET 404; surface a typed error instead so the
  // delete flow doesn't dereference `dependents.counts` on a missing org.
  const result = await apiFetch<OrgDependentsResponse | null>(
    `/v1/admin/orgs/${encodeURIComponent(identifier)}/dependents`,
  );
  if (!result) {
    throw new Error(`Org dependents preview not available for "${identifier}" (org not found).`);
  }
  return result;
}

export async function updateOrg(
  identifier: string,
  data: Record<string, unknown>,
): Promise<Organization> {
  return apiFetch<Organization>(`/v1/orgs/${encodeURIComponent(identifier)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function getOrgAccountsBySlug(
  orgSlug: string,
): Promise<Array<{ platform: string; handle: string }>> {
  const data = await apiFetch<{
    accounts: Array<{ platform: string; handle: string }>;
  }>(`/v1/orgs/${orgSlug}`);
  return data?.accounts ?? [];
}

export async function linkOrgAccount(
  orgSlug: string,
  platform: string,
  handle: string,
): Promise<OrgAccount> {
  return apiFetch<OrgAccount>(`/v1/orgs/${orgSlug}/accounts`, {
    method: "POST",
    body: JSON.stringify({ platform, handle }),
  });
}

export async function unlinkOrgAccount(
  orgSlug: string,
  platform: string,
  handle: string,
): Promise<void> {
  // The API doesn't have a dedicated unlink endpoint — use PATCH to update org or
  // we need to add one. For now, this is a placeholder that will need a matching API endpoint.
  // The simplest approach: DELETE /v1/orgs/:slug/accounts/:platform/:handle
  await apiFetch(`/v1/orgs/${orgSlug}/accounts/${platform}/${encodeURIComponent(handle)}`, {
    method: "DELETE",
  });
}

// ── Product queries ──

export async function createProduct(
  orgId: string,
  name: string,
  opts?: { slug?: string; url?: string; description?: string; category?: string },
): Promise<Product> {
  return apiFetch<Product>(`/v1/products`, {
    method: "POST",
    body: JSON.stringify({
      orgId,
      name,
      slug: opts?.slug,
      url: opts?.url,
      description: opts?.description,
      category: opts?.category,
    }),
  });
}

/** Sibling of `resolveSourceTarget` for products. Same identifier shapes. */
async function resolveProductTarget(
  identifier: string,
): Promise<{ pathSegment: string; productId: string } | null> {
  if (identifier.startsWith("prod_")) {
    return {
      pathSegment: `/v1/products/${encodeURIComponent(identifier)}`,
      productId: identifier,
    };
  }
  const slash = identifier.indexOf("/");
  if (slash > 0 && slash < identifier.length - 1) {
    const orgSlug = identifier.slice(0, slash);
    const productSlug = identifier.slice(slash + 1);
    return {
      pathSegment: `/v1/orgs/${encodeURIComponent(orgSlug)}/products/${encodeURIComponent(productSlug)}`,
      productId: "",
    };
  }
  const resolved = await apiFetch<{
    productId: string;
    productSlug: string;
    orgSlug: string;
  } | null>(`/v1/lookups/product-by-slug?slug=${encodeURIComponent(identifier)}`);
  if (!resolved) return null;
  return {
    pathSegment: `/v1/orgs/${encodeURIComponent(resolved.orgSlug)}/products/${encodeURIComponent(resolved.productSlug)}`,
    productId: resolved.productId,
  };
}

export async function findProduct(identifier: string): Promise<Product | null> {
  const target = await resolveProductTarget(identifier);
  if (!target) return null;
  return apiFetch<Product | null>(target.pathSegment);
}

export async function getProductsByOrg(
  orgId: string,
): Promise<Array<Product & { sourceCount: number }>> {
  return apiFetch<Array<Product & { sourceCount: number }>>(`/v1/products?orgId=${orgId}`);
}

export async function updateProduct(
  product: Pick<Product, "id">,
  data: Record<string, unknown>,
): Promise<Product> {
  return apiFetch<Product>(`/v1/products/${encodeURIComponent(product.id)}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export async function deleteProduct(productId: string): Promise<void> {
  await apiFetch(`/v1/products/${productId}`, { method: "DELETE" });
}

// ── Collections ──

export async function listCollections(): Promise<CollectionListItem[]> {
  return apiFetch<CollectionListItem[]>("/v1/collections");
}

export async function getCollection(slug: string): Promise<CollectionDetail | null> {
  return apiFetch<CollectionDetail | null>(`/v1/collections/${encodeURIComponent(slug)}`);
}

export async function createCollection(input: CreateCollectionRequest): Promise<CollectionRow> {
  return apiFetch<CollectionRow>("/v1/collections", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateCollection(
  slug: string,
  input: UpdateCollectionRequest,
): Promise<CollectionRow> {
  return apiFetch<CollectionRow>(`/v1/collections/${encodeURIComponent(slug)}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function deleteCollection(slug: string): Promise<void> {
  await apiFetch(`/v1/collections/${encodeURIComponent(slug)}`, { method: "DELETE" });
}

export async function replaceCollectionMembers(
  slug: string,
  orgs: ReplaceCollectionMembersRequest["orgs"],
): Promise<{ collectionSlug: string; members: { orgId: string; position: number }[] }> {
  const payload: ReplaceCollectionMembersRequest = { orgs };
  return apiFetch(`/v1/collections/${encodeURIComponent(slug)}/members`, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export async function addCollectionMember(
  slug: string,
  member: AddCollectionMemberRequest,
): Promise<{ collectionSlug: string; orgId: string; position: number }> {
  return apiFetch(`/v1/collections/${encodeURIComponent(slug)}/members`, {
    method: "POST",
    body: JSON.stringify(member),
  });
}

export async function removeCollectionMember(slug: string, org: string): Promise<void> {
  await apiFetch(`/v1/collections/${encodeURIComponent(slug)}/members/${encodeURIComponent(org)}`, {
    method: "DELETE",
  });
}

// ── Tags ──

export async function getOrCreateTag(name: string): Promise<Tag> {
  return apiFetch<Tag>("/v1/tags", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export async function getTagsForOrg(orgId: string): Promise<string[]> {
  return apiFetch<string[]>(`/v1/orgs/${orgId}/tags`);
}

export async function addTagsToOrg(orgId: string, tagNames: string[]): Promise<void> {
  await apiFetch(`/v1/orgs/${orgId}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tags: tagNames }),
  });
}

export async function removeTagsFromOrg(orgId: string, tagNames: string[]): Promise<void> {
  await apiFetch(`/v1/orgs/${orgId}/tags`, {
    method: "DELETE",
    body: JSON.stringify({ tags: tagNames }),
  });
}

export async function getTagsForProduct(productId: string): Promise<string[]> {
  return apiFetch<string[]>(`/v1/products/${productId}/tags`);
}

export async function addTagsToProduct(productId: string, tagNames: string[]): Promise<void> {
  await apiFetch(`/v1/products/${productId}/tags`, {
    method: "PUT",
    body: JSON.stringify({ tags: tagNames }),
  });
}

export async function removeTagsFromProduct(productId: string, tagNames: string[]): Promise<void> {
  await apiFetch(`/v1/products/${productId}/tags`, {
    method: "DELETE",
    body: JSON.stringify({ tags: tagNames }),
  });
}

// ── Status events ──

export async function postStatusEvent(event: {
  type: string;
  sessionId: string;
  [key: string]: unknown;
}): Promise<{ cancelRequested: boolean }> {
  try {
    const result = await apiFetch<{ cancelRequested?: boolean }>("/v1/status/event", {
      method: "POST",
      body: JSON.stringify(event),
    });
    return { cancelRequested: result?.cancelRequested === true };
  } catch {
    // Graceful fallback if the response isn't JSON or the request fails
    return { cancelRequested: false };
  }
}

// ── Recent releases ──

export async function getRecentReleases(
  sourceIdentifier: string,
  cutoffIso: string,
): Promise<Release[]> {
  return apiFetch<Release[]>(
    `/v1/sources/${encodeURIComponent(sourceIdentifier)}/recent-releases?cutoff=${cutoffIso}`,
  );
}

// ── Release summaries ──

export async function getSummariesForSource(sourceSlugOrId: string): Promise<ReleaseSummary[]> {
  return apiFetch<ReleaseSummary[]>(`/v1/sources/${encodeURIComponent(sourceSlugOrId)}/summaries`);
}

export async function upsertSummary(
  sourceSlugOrId: string,
  data: Omit<NewReleaseSummary, "sourceId" | "orgId">,
): Promise<void> {
  await apiFetch(`/v1/sources/${encodeURIComponent(sourceSlugOrId)}/summaries`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function getMonthlySummary(
  sourceSlugOrId: string,
  year: number,
  month: number,
): Promise<ReleaseSummary | undefined> {
  const rows = await apiFetch<ReleaseSummary[]>(
    `/v1/sources/${encodeURIComponent(sourceSlugOrId)}/summaries?type=monthly&year=${year}&month=${month}`,
  );
  return rows[0];
}

// ── Overview / Playbook Pages ──

const SCOPE_RESOURCE = { org: "orgs", product: "products" } as const;

export async function getOverview(
  scope: keyof typeof SCOPE_RESOURCE,
  identifier: string,
): Promise<KnowledgePage | null> {
  return apiFetch<KnowledgePage | null>(
    `/v1/${SCOPE_RESOURCE[scope]}/${encodeURIComponent(identifier)}/overview`,
  );
}

export async function getPlaybook(identifier: string): Promise<KnowledgePage | null> {
  return apiFetch<KnowledgePage | null>(`/v1/orgs/${encodeURIComponent(identifier)}/playbook`);
}

export async function upsertOverview(
  orgSlug: string,
  data: {
    content: string;
    releaseCount: number;
    lastContributingReleaseAt?: string | null;
  },
): Promise<void> {
  await apiFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}/overview`, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export async function updatePlaybookNotes(orgSlug: string, notes: string): Promise<void> {
  await apiFetch(`/v1/orgs/${encodeURIComponent(orgSlug)}/playbook/notes`, {
    method: "PATCH",
    body: JSON.stringify({ notes }),
  });
}

/**
 * Release shape in overview inputs. `content` is pre-hydrated (absolute CDN
 * URLs), and `media` entries carry resolved `r2Url`s — ready to paste into
 * generated markdown. This is a narrower projection than the raw `Release`
 * row: only the fields the overview agent needs.
 */
export interface OverviewInputRelease {
  id: string;
  version: string | null;
  title: string;
  content: string;
  publishedAt: string | null;
  url: string | null;
  media: MediaItem[];
}

export interface OverviewInputs {
  org: Pick<Organization, "id" | "slug" | "name" | "description">;
  sources: Pick<Source, "id" | "slug" | "name" | "type">[];
  existingContent: string | null;
  selected: OverviewInputRelease[];
  totalAvailable: number;
  windowDays: number;
}

export async function getOverviewInputs(
  slug: string,
  opts: { window?: number; limit?: number } = {},
): Promise<OverviewInputs> {
  const params = new URLSearchParams();
  if (opts.window !== undefined) params.set("window", String(opts.window));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<OverviewInputs>(
    `/v1/orgs/${encodeURIComponent(slug)}/overview/inputs${qs ? `?${qs}` : ""}`,
  );
}

export async function getOverviewInputsCheck(
  slug: string,
  opts: { window?: number; limit?: number } = {},
): Promise<OverviewInputsCheck> {
  const params = new URLSearchParams();
  params.set("check", "true");
  if (opts.window !== undefined) params.set("window", String(opts.window));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  return apiFetch<OverviewInputsCheck>(
    `/v1/orgs/${encodeURIComponent(slug)}/overview/inputs?${params.toString()}`,
  );
}

// ── Overview manifest (cross-org admin planning) ──

export interface OverviewManifestQueryOpts {
  staleDays?: number;
  missing?: boolean;
  hasActivity?: boolean;
  plan?: boolean;
  page?: number;
  limit?: number;
}

export async function getOverviewManifest(
  opts: OverviewManifestQueryOpts = {},
): Promise<OverviewManifestResponse> {
  const params = new URLSearchParams();
  if (opts.staleDays !== undefined) params.set("staleDays", String(opts.staleDays));
  if (opts.missing) params.set("missing", "true");
  if (opts.hasActivity) params.set("hasActivity", "true");
  if (opts.plan) params.set("format", "plan");
  if (opts.page !== undefined) params.set("page", String(opts.page));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<OverviewManifestResponse>(`/v1/admin/overviews${qs ? `?${qs}` : ""}`);
}

// ── Media Assets ──

export interface MediaAssetInput {
  r2Key: string;
  sourceUrl: string;
  sourceFilename: string | null;
  contentType: string;
  contentHash: string;
  byteSize: number;
  sourceId: string;
  releaseId?: string;
}

export async function insertMediaAssets(assets: MediaAssetInput[]): Promise<{ inserted: number }> {
  return apiFetch("/v1/media/assets", {
    method: "POST",
    body: JSON.stringify({ assets }),
  });
}

export async function getMediaAssetStats(): Promise<{ count: number; totalBytes: number }> {
  return apiFetch("/v1/media/assets/stats");
}

export async function queryReleasesWithMedia(): Promise<
  { id: string; sourceId: string; media: string }[]
> {
  return apiFetch("/v1/releases?hasMedia=true&fields=id,sourceId,media");
}

// ── Sessions ──

export async function listSessions(opts?: {
  limit?: number;
  page?: number;
  type?: string;
  status?: string;
  recentMinutes?: number;
}): Promise<ListResponse<Session>> {
  const params = new URLSearchParams();
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  if (opts?.type) params.set("type", opts.type);
  if (opts?.status) params.set("status", opts.status);
  if (opts?.recentMinutes != null) params.set("recent_minutes", String(opts.recentMinutes));
  const qs = params.toString();
  return apiFetch<ListResponse<Session>>(`/v1/sessions${qs ? `?${qs}` : ""}`);
}

export async function getSession(sessionId: string): Promise<Session | null> {
  return apiFetch<Session | null>(`/v1/sessions/${sessionId}`);
}

export async function getActiveSources(): Promise<{
  slugs: string[];
  sessionMap: Record<string, string>;
}> {
  return apiFetch<{ slugs: string[]; sessionMap: Record<string, string> }>(
    "/v1/sessions/active-sources",
  );
}

export async function cancelSession(sessionId: string): Promise<{ ok: boolean; error?: string }> {
  return apiFetch<{ ok: boolean; error?: string }>(`/v1/sessions/${sessionId}/cancel`, {
    method: "POST",
  });
}

// ── URL evaluation (admin-only) ──

export async function evaluateUrl(url: string): Promise<EvaluationResult> {
  return apiFetch<EvaluationResult>(`/v1/evaluate?url=${encodeURIComponent(url)}`);
}

// ── Semantic search backfill (admin-only) ──

export async function embedReleases(body: {
  since?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<EmbedBackfillResponse> {
  return apiFetch<EmbedBackfillResponse>("/v1/workflows/embed-releases", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function embedEntities(body: {
  kind?: "org" | "product" | "source";
  limit?: number;
  dryRun?: boolean;
}): Promise<EmbedBackfillResponse> {
  return apiFetch<EmbedBackfillResponse>("/v1/workflows/embed-entities", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function embedChangelogs(body: {
  sourceSlug?: string;
  limit?: number;
  dryRun?: boolean;
}): Promise<EmbedBackfillResponse> {
  return apiFetch<EmbedBackfillResponse>("/v1/workflows/embed-changelogs", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getEmbedStatus(): Promise<EmbedStatusResponse> {
  return apiFetch<EmbedStatusResponse>("/v1/admin/embed/status");
}

// ── Domain Aliases ──

export async function getAliases(
  scope: keyof typeof SCOPE_RESOURCE,
  identifier: string,
): Promise<string[]> {
  const row = await apiFetch<{ aliases?: string[] } | null>(
    `/v1/${SCOPE_RESOURCE[scope]}/${encodeURIComponent(identifier)}`,
  );
  return row?.aliases ?? [];
}

export async function setAliases(
  scope: keyof typeof SCOPE_RESOURCE,
  identifier: string,
  aliases: string[],
): Promise<void> {
  await apiFetch(`/v1/${SCOPE_RESOURCE[scope]}/${encodeURIComponent(identifier)}`, {
    method: "PATCH",
    body: JSON.stringify({ aliases }),
  });
}

// ── Source metadata (merge-and-update helper) ──

/**
 * Merge a partial metadata object into the source's metadata JSON column
 * via a PATCH on the remote API.
 */
export async function updateSourceMeta(
  source: Source,
  meta: Record<string, unknown>,
): Promise<void> {
  let existing: Record<string, unknown> = {};
  if (source.metadata) {
    try {
      const parsed = JSON.parse(source.metadata);
      if (parsed && typeof parsed === "object") existing = parsed as Record<string, unknown>;
    } catch {
      /* malformed metadata — overwrite */
    }
  }
  const merged: Record<string, unknown> = { ...existing };
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined) delete merged[k];
    else merged[k] = v;
  }
  const serialized = JSON.stringify(merged);
  await apiFetch(`/v1/sources/${encodeURIComponent(source.id)}`, {
    method: "PATCH",
    body: JSON.stringify({ metadata: serialized }),
  });
  source.metadata = serialized;
}

// ── Bulk source helpers ──

export async function findSourcesBySlugs(slugs: string[]): Promise<Source[]> {
  if (slugs.length === 0) return [];
  const results = await Promise.all(slugs.map((s) => findSource(s)));
  return results.filter((r): r is Source => r !== null);
}

export async function deleteSources(sources: Array<Pick<Source, "id">>): Promise<void> {
  await Promise.all(sources.map((s) => deleteSource(s)));
}

// ── Exclusion check (compose blocked + ignored) ──

export async function isUrlExcluded(
  url: string,
  orgId?: string,
): Promise<{ excluded: boolean; reason?: string; scope?: "blocked" | "ignored" }> {
  if (orgId) {
    const [blocked, ignored] = await Promise.all([findBlockedUrl(url), findIgnoredUrl(url, orgId)]);
    if (blocked) return { excluded: true, reason: blocked.reason ?? undefined, scope: "blocked" };
    if (ignored) return { excluded: true, reason: ignored.reason ?? undefined, scope: "ignored" };
    return { excluded: false };
  }
  const blocked = await findBlockedUrl(url);
  if (blocked) return { excluded: true, reason: blocked.reason ?? undefined, scope: "blocked" };
  return { excluded: false };
}
