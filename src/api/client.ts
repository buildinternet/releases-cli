import { getApiUrl, getApiKey, isAdminMode } from "../lib/mode.js";
import { shouldRecordMutation, recordMutation } from "../lib/mutation-log.js";
import { logger } from "@releases/lib/logger";
import { daysAgoIso } from "@buildinternet/releases-core/dates";
import type { Kind } from "@buildinternet/releases-core/kinds";
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
  ActiveFetchSession,
  LatestRelease,
  UsageStatsResponse,
  Session,
  EmbedBackfillResponse,
  EmbedStatusResponse,
  EvaluationResult,
  MediaItem,
  OrgDependentsResponse,
  AppStoreMaterializeResponse,
  VideoMaterializeResponse,
} from "./types.js";
import { computePagination, type ListResponse } from "@buildinternet/releases-core/cli-contracts";
import type {
  DomainLookupResponse,
  OverviewCitation,
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
  SetOrgAvatarResponse,
} from "@buildinternet/releases-api-types";
export type {
  DomainLookupResponse,
  OverviewCitation,
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
  ActiveFetchSession,
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

  // Empty string when no method is set — `shouldRecordMutation` rejects it, so
  // GETs never log and the `method` field is a real verb whenever we do.
  const method = opts?.method ?? "";
  const logMutation = shouldRecordMutation(method, path);

  let res: Response;
  try {
    res = await fetch(url, {
      ...opts,
      headers,
    });
  } catch (err) {
    // Transport-level failure (DNS, connection refused, abort) — no response,
    // but the mutating attempt still belongs in the audit trail.
    if (logMutation) {
      recordMutation({
        method,
        path,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    throw err;
  }

  if (res.status === 404 && (!opts?.method || opts.method === "GET")) return null as T;

  if (!res.ok) {
    const body = await res.json().catch(() => ({ message: res.statusText }));
    const message = (body as { message?: string }).message ?? res.statusText;
    if (logMutation) {
      recordMutation({ method, path, ok: false, status: res.status, error: message });
    }
    throw new Error(`API error (${res.status}) on ${opts?.method ?? "GET"} ${path}: ${message}`);
  }

  if (logMutation) {
    recordMutation({ method, path, ok: true, status: res.status });
  }

  return res.json();
}

// ── Source queries ──

export interface AmbiguousSourceCandidate {
  id: string;
  slug: string;
  orgSlug: string | null;
}

/**
 * Raised when a bare source slug matches sources in more than one org. Source
 * slugs are unique per-org but not globally (#690), so a bare `blog` can sit
 * under several orgs. Rather than silently resolving to one (the old
 * oldest-match behavior, which could read from — or mutate — the wrong org),
 * resolution throws this and the CLI prints the `org/slug` + `src_…`
 * disambiguators carried in `candidates` (#264).
 */
export class AmbiguousSourceError extends Error {
  readonly slug: string;
  readonly candidates: AmbiguousSourceCandidate[];
  constructor(slug: string, candidates: AmbiguousSourceCandidate[]) {
    super(
      `Source slug "${slug}" is ambiguous — it matches ${candidates.length} sources across orgs.`,
    );
    this.name = "AmbiguousSourceError";
    this.slug = slug;
    this.candidates = candidates;
  }
}

/**
 * Lists every source whose slug **exactly** matches `slug`, across all orgs,
 * including hidden sources (matching the visibility the legacy
 * `source-by-slug` resolver had against `sources_active`). Distinct from the
 * `?q=` substring search. Backs the cross-org ambiguity check in
 * `resolveSourceTarget` (#264).
 *
 * The exact-slug match is re-applied client-side so the result stays correct
 * even against an older API build that doesn't yet honor `?slug=` (it would
 * otherwise return an unfiltered page and make every bare slug look ambiguous).
 */
export async function listSourcesBySlug(slug: string): Promise<SourceWithOrg[]> {
  const rows =
    (await apiFetch<SourceWithOrg[] | null>(
      `/v1/sources?slug=${encodeURIComponent(slug)}&include_hidden=true`,
    )) ?? [];
  return rows.filter((r) => r.slug === slug);
}

/**
 * Resolves an operator-supplied source identifier to a path the API can match
 * without ambiguity. Accepts:
 *
 *   - `src_…` typed IDs: pass straight through; globally unique.
 *   - `org/slug` coordinates: split locally; the API takes the org-scoped
 *     pair directly.
 *   - bare slugs: enumerate every org's source with this exact slug via
 *     `listSourcesBySlug`. Resolve only when exactly one matches; throw
 *     `AmbiguousSourceError` when more than one org claims the slug so the
 *     caller can surface `org/slug` + `src_…` disambiguators instead of
 *     silently picking the oldest (#264).
 *
 * Returns `null` when no matching source exists. Throws `AmbiguousSourceError`
 * on a cross-org bare-slug collision, or `Error` on API failures.
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
  // Bare slug — slugs are unique per-org but not globally, so enumerate every
  // org's source with this exact slug.
  const matches = await listSourcesBySlug(identifier);
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    throw new AmbiguousSourceError(
      identifier,
      matches.map((m) => ({ id: m.id, slug: m.slug, orgSlug: m.orgSlug })),
    );
  }
  // Exactly one match — hydrate through the globally-unambiguous typed id.
  const only = matches[0]!;
  return { pathSegment: `/v1/sources/${encodeURIComponent(only.id)}`, sourceId: only.id };
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
  includeEmpty?: boolean;
}): Promise<ListResponse<Organization>> {
  const params = new URLSearchParams();
  if (opts?.query) params.set("q", opts.query);
  if (opts?.platform) params.set("platform", opts.platform);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  if (opts?.includeEmpty) params.set("includeEmpty", "true");
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

// ── User roles (OAuth scope entitlement) ──

/** A user's role row as returned by `/v1/admin/users/role`. `role` NULL → read-only. */
export interface UserRole {
  userId: string;
  email: string;
  role: string | null;
}

/** The PATCH response, which also carries the role the user held before the change. */
export interface SetUserRoleResult extends UserRole {
  previousRole: string | null;
}

/** Exactly one of email/userId must be set; the route enforces this too. */
export type UserIdentifier = { email?: string; userId?: string };

function userRoleQuery(id: UserIdentifier): string {
  return id.userId
    ? `userId=${encodeURIComponent(id.userId)}`
    : `email=${encodeURIComponent(id.email ?? "")}`;
}

/** Read a user's current role. Returns null when no such user exists (404). */
export async function getUserRole(id: UserIdentifier): Promise<UserRole | null> {
  return apiFetch<UserRole | null>(`/v1/admin/users/role?${userRoleQuery(id)}`);
}

/** Set a user's role (user | curator | admin). Throws on 400/404. */
export async function setUserRole(id: UserIdentifier, role: string): Promise<SetUserRoleResult> {
  return apiFetch<SetUserRoleResult>(`/v1/admin/users/role`, {
    method: "PATCH",
    body: JSON.stringify({ ...id, role }),
  });
}

/** List users holding a curator or admin role. */
export async function listUserRoles(): Promise<UserRole[]> {
  const res = await apiFetch<{ users: UserRole[] } | null>(`/v1/admin/users/roles`);
  // An empty list is a 200 `{ users: [] }`; apiFetch only yields null on a 404,
  // which here means the admin route is missing/undeployed. Surface that instead
  // of masking it as "no curator/admin users".
  if (!res) {
    throw new Error(
      "listUserRoles: 404/empty from /v1/admin/users/roles — is the admin users route deployed?",
    );
  }
  return res.users ?? [];
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
    /** Product identifier (org/slug coordinate, prod_… id, or product slug);
     *  scopes hits to that product's sources. Resolved server-side (#1218). */
    product?: string;
    mode?: "lexical" | "semantic" | "hybrid";
    kind?: Kind;
    /** ISO date or relative shorthand (90d/4w/6m/2y); resolved server-side. */
    since?: string;
    until?: string;
  },
): Promise<UnifiedSearchResponse> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  if (opts?.org) params.set("org", opts.org);
  if (opts?.domain) params.set("domain", opts.domain);
  if (opts?.product) params.set("product", opts.product);
  if (opts?.mode) params.set("mode", opts.mode);
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.since) params.set("since", opts.since);
  if (opts?.until) params.set("until", opts.until);
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
  kind?: Kind;
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
  if (opts?.kind) params.set("kind", opts.kind);
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

interface RawFetchLogRow {
  id: string;
  sourceId: string;
  releasesFound: number;
  releasesInserted: number;
  durationMs: number | null;
  status: string;
  error: string | null;
  rawContent: string | null;
  createdAt: string;
}

// The API fetch-log endpoint returns raw fetch_log rows without source name/slug.
// In remote mode we don't have the join data, so we provide what we can.
function toFetchLogEntry(l: RawFetchLogRow): FetchLogEntry {
  return {
    id: l.id,
    sourceName: "",
    sourceSlug: "",
    status: l.status,
    releasesFound: l.releasesFound,
    releasesInserted: l.releasesInserted,
    durationMs: l.durationMs,
    error: l.error,
    createdAt: l.createdAt,
  };
}

export async function getFetchLogs(opts: {
  /** Source identifier (src_… or slug). */
  source?: string;
  limit: number;
}): Promise<{ logs: FetchLogEntry[]; activeSession: ActiveFetchSession | null }> {
  // Always request the envelope: for a source-filtered query it carries the live
  // in-flight fetch (`activeSession`); for the global list it degrades to just
  // `items` (no single active session). One response shape instead of branching.
  const params = new URLSearchParams({ limit: String(opts.limit), envelope: "true" });
  if (opts.source) params.set("source", opts.source);
  const env = await apiFetch<{
    items: RawFetchLogRow[];
    activeSession?: ActiveFetchSession | null;
  }>(`/v1/admin/logs/fetch?${params}`);
  return {
    logs: (env.items ?? []).map(toFetchLogEntry),
    activeSession: env.activeSession ?? null,
  };
}

// ── Stuck sources ──

export interface StuckSource {
  sourceId: string;
  sourceSlug: string;
  name: string;
  type: "github" | "scrape" | "feed" | "agent";
  url: string;
  kind: string | null;
  orgSlug: string | null;
  orgName: string | null;
  fetchPriority: "normal" | "low" | "paused";
  isPrimary: boolean;
  isHidden: boolean;
  recentAttempts: number;
  recentErrors: number;
  lastAttemptAt: string | null;
  lastError: string | null;
  lastErrorCategory: string | null;
  /** null = the source has NEVER fetched successfully */
  lastSuccessAt: string | null;
  lastFetchedAt: string | null;
  sourceCreatedAt: string | null;
}

export interface StuckSourcesResponse {
  items: StuckSource[];
  pagination: {
    page: number;
    pageSize: number;
    returned: number;
    totalItems?: number;
    totalPages?: number;
    hasMore: boolean;
  };
  meta: {
    window: number;
    minAttempts: number;
    includePaused: boolean;
  };
}

export async function getStuckSources(opts?: {
  window?: number;
  minAttempts?: number;
  includePaused?: boolean;
  limit?: number;
  page?: number;
}): Promise<StuckSourcesResponse> {
  const params = new URLSearchParams();
  if (opts?.window != null) params.set("window", String(opts.window));
  if (opts?.minAttempts != null) params.set("minAttempts", String(opts.minAttempts));
  if (opts?.includePaused) params.set("includePaused", "true");
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  const qs = params.toString();
  return apiFetch<StuckSourcesResponse>(`/v1/admin/sources/stuck${qs ? `?${qs}` : ""}`);
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

// Common release-row wire shape shared by `/v1/releases/latest` and the
// org feed (`/v1/orgs/:slug/releases`). The org feed carries a few extra
// fields (prerelease, coverageCount, source.appStore) the CLI ignores, so
// declaring the narrower shape here is fine — `toLatestRelease` only reads
// what both endpoints return.
type LatestReleaseWire = {
  id: string;
  version: string | null;
  title: string;
  summary: string | null;
  titleGenerated?: string | null;
  titleShort?: string | null;
  contentChars?: number | null;
  contentTokens?: number | null;
  publishedAt: string | null;
  media: Array<{ type: string; url: string; alt?: string; r2Url?: string }>;
  source: { slug: string; name: string; type: string };
  product?: { slug: string; name: string } | null;
};

// `titleGenerated`/`titleShort`/`contentChars`/`contentTokens` are carried so
// the shared renderer's description fallback chain and the slim JSON size hints
// have data without an extra round-trip. #215.
function toLatestRelease(r: LatestReleaseWire): LatestRelease {
  return {
    id: r.id,
    title: r.title,
    version: r.version,
    publishedAt: r.publishedAt,
    sourceName: r.source.name,
    sourceSlug: r.source.slug,
    summary: r.summary ?? null,
    titleGenerated: r.titleGenerated ?? null,
    titleShort: r.titleShort ?? null,
    contentChars: r.contentChars ?? null,
    contentTokens: r.contentTokens ?? null,
    media: toMediaItems(r.media),
    product: r.product ?? null,
  };
}

export async function getLatestReleases(opts: {
  /** Source identifier (src_… or slug). */
  source?: string;
  /** Organization identifier (org_… or slug). */
  org?: string;
  count: number;
  includeCoverage?: boolean;
  /** ISO date or relative shorthand (90d/4w/6m/2y); resolved server-side. */
  since?: string;
  until?: string;
}): Promise<LatestRelease[]> {
  const qs = new URLSearchParams();
  qs.set("count", String(opts.count));
  if (opts.source) qs.set("source", opts.source);
  if (opts.org) qs.set("org", opts.org);
  if (opts.includeCoverage) qs.set("include_coverage", "true");
  if (opts.since) qs.set("since", opts.since);
  if (opts.until) qs.set("until", opts.until);

  const data = await apiFetch<{ releases: LatestReleaseWire[] }>(
    `/v1/releases/latest?${qs.toString()}`,
  );
  if (!data) return [];
  return data.releases.map(toLatestRelease);
}

/**
 * Resolve a product identifier to the `{ orgRef, product }` pair the org
 * release feed needs (`GET /v1/orgs/:orgRef/releases?product=…`). Mirrors the
 * identifier shapes `resolveProductTarget` accepts:
 *   - `prod_…` ids: fetch the product to recover its org (the feed is
 *     org-scoped; the org path segment accepts `org_…` ids).
 *   - `org/slug` coordinates: split locally, no round-trip. Existence is
 *     validated by the feed call (a bad coord 404s → `getProductReleases`
 *     returns `null`).
 *   - bare slugs: bounce through `/v1/lookups/product-by-slug` for the
 *     canonical org.
 * Returns `null` when a `prod_…`/bare slug doesn't resolve to a product.
 */
export async function resolveProductFeedTarget(
  identifier: string,
): Promise<{ orgRef: string; product: string } | null> {
  if (identifier.startsWith("prod_")) {
    const product = await findProduct(identifier);
    if (!product) return null;
    return { orgRef: product.orgId, product: identifier };
  }
  const slash = identifier.indexOf("/");
  if (slash > 0 && slash < identifier.length - 1) {
    return { orgRef: identifier.slice(0, slash), product: identifier.slice(slash + 1) };
  }
  const resolved = await apiFetch<{
    productId: string;
    productSlug: string;
    orgSlug: string;
  } | null>(`/v1/lookups/product-by-slug?slug=${encodeURIComponent(identifier)}`);
  if (!resolved) return null;
  return { orgRef: resolved.orgSlug, product: resolved.productSlug };
}

/**
 * One product's cross-source release feed via `GET /v1/orgs/:orgRef/releases?
 * product=…`. Cursor-paginated; the server's cursor is opaque to the CLI.
 * Returns `null` when the org or product is unknown (the endpoint 404s), which
 * `apiFetch` maps to `null` for GETs — distinct from a valid-but-empty product
 * (`{ releases: [], … }`).
 */
export async function getProductReleases(opts: {
  orgRef: string;
  product: string;
  count: number;
  cursor?: string | null;
  includeCoverage?: boolean;
  since?: string;
  until?: string;
}): Promise<{ releases: LatestRelease[]; nextCursor: string | null } | null> {
  const qs = new URLSearchParams();
  qs.set("product", opts.product);
  qs.set("limit", String(opts.count));
  if (opts.cursor) qs.set("cursor", opts.cursor);
  if (opts.includeCoverage) qs.set("include_coverage", "true");
  if (opts.since) qs.set("since", opts.since);
  if (opts.until) qs.set("until", opts.until);

  const data = await apiFetch<{
    releases: LatestReleaseWire[];
    pagination?: { nextCursor: string | null };
  } | null>(`/v1/orgs/${encodeURIComponent(opts.orgRef)}/releases?${qs.toString()}`);
  if (!data) return null;
  return {
    releases: data.releases.map(toLatestRelease),
    nextCursor: data.pagination?.nextCursor ?? null,
  };
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

export async function deleteSource(
  source: Pick<Source, "id">,
  opts?: { hard?: boolean },
): Promise<void> {
  // Soft delete (default) tombstones the row (sets deletedAt + mangles the
  // slug); `?hard=true` removes it outright so the URL can be re-onboarded
  // fresh. See #1184.
  const query = opts?.hard ? "?hard=true" : "";
  await apiFetch(`/v1/sources/${encodeURIComponent(source.id)}${query}`, { method: "DELETE" });
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
  opts?: { hard?: boolean },
): Promise<{ suppressed: number } | { deleted: number; hard: true }> {
  // Default (soft) suppresses rows with reason "force_refetch" but leaves them
  // occupying UNIQUE(source_id, url) — a re-fetch upserts on top but never
  // un-suppresses, so the rows stay hidden. `?hard=true` removes them so the
  // dedup slot frees up and a corrected re-fetch ingests clean. See #1184.
  const query = opts?.hard ? "?hard=true" : "";
  return apiFetch(`/v1/sources/${encodeURIComponent(source.id)}/releases${query}`, {
    method: "DELETE",
  });
}

export async function createSource(data: {
  name: string;
  slug: string;
  type: string;
  url: string;
  orgId?: string | null;
  productId?: string | null;
  metadata?: string;
  isPrimary?: boolean;
}): Promise<Source> {
  // Strip null/undefined values so the API's z.string().optional() schema
  // doesn't reject an explicit `"productId": null` in the JSON body.
  const body = Object.fromEntries(
    Object.entries(data).filter(([, v]) => v !== null && v !== undefined),
  );
  return apiFetch<Source>("/v1/sources", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Materialize an App Store source via `POST /v1/sources/appstore`. Pass exactly
 * one of `url` (`apps.apple.com/.../id<trackId>`) or `trackId` (bare numeric).
 * The endpoint resolves the listing via the iTunes Lookup API, mints the first
 * release, and backfills the product avatar, returning the source row;
 * `status: "indexed"` is a new source, `"existing"` an idempotent hit on a
 * prior materialize of the same trackId. Writes should stay serial: concurrent
 * POSTs for a brand-new org/product race on `UNIQUE(org_id, slug)`.
 */
export async function createAppStoreSource(params: {
  url?: string;
  trackId?: string;
  platform?: "ios" | "macos";
  storefront?: string;
  orgSlug?: string;
  productSlug?: string;
}): Promise<AppStoreMaterializeResponse> {
  // Strip undefined/null so optional fields don't reach the API as explicit nulls.
  const body = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined),
  );
  return apiFetch<AppStoreMaterializeResponse>("/v1/sources/appstore", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Materialize a video source via `POST /v1/sources/video`. Resolves a YouTube
 * channel/playlist URL into its Atom feed, mints a `video` source under the
 * given org, and backfills current videos as releases (description-only,
 * summarizer-cleaned, marketing-filtered). `orgSlug` or `orgId` is required —
 * unlike the App Store path, no org is derived from the feed, so the org must
 * already exist. Idempotent on the resolved feed URL: `status: "indexed"` is a
 * new source (HTTP 201), `"existing"` an idempotent hit (HTTP 200). Writes
 * should stay serial — concurrent POSTs for a brand-new org race on
 * `UNIQUE(org_id, slug)`.
 */
export async function createVideoSource(params: {
  url: string;
  orgSlug?: string;
  orgId?: string;
  productId?: string;
}): Promise<VideoMaterializeResponse> {
  // Strip undefined/null so optional fields don't reach the API as explicit nulls.
  const body = Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== null && v !== undefined),
  );
  return apiFetch<VideoMaterializeResponse>("/v1/sources/video", {
    method: "POST",
    body: JSON.stringify(body),
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

/**
 * Delete an org. Soft delete (default) accepts a slug or `org_…` ID; **hard
 * delete requires the typed `org_…` ID** — the server rejects a slug on the
 * destructive path as a guardrail (#690). Callers passing `{ hard: true }` must
 * resolve the identifier to its ID first (see `orgDeleteAction`).
 */
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

/**
 * Mirror a remote image to R2 and set it as the org avatar (#1406). The server
 * fetches + validates (square raster) + stores at `orgs/{slug}.{ext}`, keeping CF
 * credentials server-side; the CLI only resolves a concrete image URL.
 */
export async function setOrgAvatar(
  identifier: string,
  sourceUrl: string,
): Promise<SetOrgAvatarResponse> {
  return apiFetch<SetOrgAvatarResponse>(`/v1/orgs/${encodeURIComponent(identifier)}/avatar`, {
    method: "POST",
    body: JSON.stringify({ sourceUrl }),
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
  opts?: { slug?: string; url?: string; description?: string; category?: string; kind?: Kind },
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
      kind: opts?.kind,
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

export type ProductWithSourceCount = Product & { sourceCount: number };

/**
 * List products via `GET /v1/products`. Omit `orgId` to enumerate products
 * across every org — the org-agnostic form backing `releases admin product
 * list` with no org argument (releases-cli#259). Returns the paginated
 * envelope so callers can surface `pagination.hasMore`; `getProductsByOrg`
 * unwraps it for the single-org callers that only want the rows.
 *
 * `/v1/products` returns a paginated envelope; the legacy bare-array shape is
 * tolerated too in case an old worker is ever in the path. Without the unwrap,
 * downstream `for/find/filter/map` would silently iterate an object and yield
 * nothing — which is what made `releases org get` skip the Products section.
 */
export async function listProducts(opts?: {
  orgId?: string;
  kind?: Kind;
  limit?: number;
  page?: number;
}): Promise<ListResponse<ProductWithSourceCount>> {
  const params = new URLSearchParams();
  if (opts?.orgId) params.set("orgId", opts.orgId);
  if (opts?.kind) params.set("kind", opts.kind);
  if (opts?.limit != null) params.set("limit", String(opts.limit));
  if (opts?.page != null) params.set("page", String(opts.page));
  const qs = params.toString();
  const raw = await apiFetch<ProductWithSourceCount[] | ListResponse<ProductWithSourceCount>>(
    `/v1/products${qs ? `?${qs}` : ""}`,
  );
  if (!raw) {
    return {
      items: [],
      pagination: computePagination({
        page: opts?.page ?? 1,
        pageSize: opts?.limit ?? 0,
        returned: 0,
        totalItems: 0,
      }),
    };
  }
  if (Array.isArray(raw)) {
    return {
      items: raw,
      pagination: computePagination({
        page: 1,
        pageSize: raw.length,
        returned: raw.length,
        totalItems: raw.length,
      }),
    };
  }
  return raw;
}

export async function getProductsByOrg(
  orgId: string,
  opts?: { kind?: Kind },
): Promise<ProductWithSourceCount[]> {
  const { items } = await listProducts({ orgId, kind: opts?.kind });
  return items;
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

/**
 * Cross-org release feed for a collection. Cursor-paginated; the API's cursor
 * format is opaque to the CLI — we just round-trip whatever the server returns.
 *
 * `CollectionReleaseItem` isn't published in api-types yet, so the wire shape
 * is declared inline. When the next api-types release lands, this can switch
 * to importing the canonical type.
 */
export interface CollectionReleaseItemCli {
  id: string;
  version: string | null;
  type: ReleaseType;
  title: string;
  summary: string;
  content: string;
  publishedAt: string | null;
  url: string | null;
  prerelease: boolean;
  source: { slug: string; name: string; type: string };
  org: { slug: string; name: string };
  product: { slug: string; name: string } | null;
}

interface CollectionReleasesResponseCli {
  releases: CollectionReleaseItemCli[];
  pagination: { nextCursor: string | null; limit: number };
}

export async function getCollectionReleases(
  slug: string,
  opts: { limit?: number; cursor?: string | null; includePrereleases?: boolean } = {},
): Promise<CollectionReleasesResponseCli | null> {
  const qs = new URLSearchParams();
  if (opts.limit !== undefined) qs.set("limit", String(opts.limit));
  if (opts.cursor) qs.set("cursor", opts.cursor);
  if (opts.includePrereleases) qs.set("include_prereleases", "1");
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  return apiFetch<CollectionReleasesResponseCli | null>(
    `/v1/collections/${encodeURIComponent(slug)}/releases${suffix}`,
  );
}

/** Collections an org is a member of. Used to indicate membership on `releases get <orgslug>`. */
export async function getOrgCollections(orgRef: string): Promise<CollectionListItem[]> {
  return apiFetch<CollectionListItem[]>(`/v1/orgs/${encodeURIComponent(orgRef)}/collections`);
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

/**
 * Knowledge page plus the inline citations the read endpoint returns. The org
 * GET (`/v1/orgs/:slug/overview`) attaches `citations` ordered by character
 * position; the product GET does not, so the field is optional.
 */
export type OverviewWithCitations = KnowledgePage & { citations?: OverviewCitation[] };

export async function getOverview(
  scope: keyof typeof SCOPE_RESOURCE,
  identifier: string,
): Promise<OverviewWithCitations | null> {
  return apiFetch<OverviewWithCitations | null>(
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
    citations?: OverviewCitation[];
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
): Promise<OverviewInputs | null> {
  const params = new URLSearchParams();
  if (opts.window !== undefined) params.set("window", String(opts.window));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  const qs = params.toString();
  return apiFetch<OverviewInputs | null>(
    `/v1/orgs/${encodeURIComponent(slug)}/overview/inputs${qs ? `?${qs}` : ""}`,
  );
}

export async function getOverviewInputsCheck(
  slug: string,
  opts: { window?: number; limit?: number } = {},
): Promise<OverviewInputsCheck | null> {
  const params = new URLSearchParams();
  params.set("check", "true");
  if (opts.window !== undefined) params.set("window", String(opts.window));
  if (opts.limit !== undefined) params.set("limit", String(opts.limit));
  return apiFetch<OverviewInputsCheck | null>(
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

// ── Source full-history backfill (admin-only) ──

/**
 * Report shape returned by POST /v1/workflows/backfill-source. Mirrors
 * `SourceBackfillReport` on the API worker (monorepo
 * workers/api/src/lib/source-backfill.ts) — kept as a local interface because
 * it is worker-internal and not part of the published `releases-api-types`.
 */
export interface SourceBackfillReport {
  source: { id: string; slug: string };
  /** How the full-page body was acquired. `snapshot` = re-extracted from a
   *  stored raw snapshot (reextract-source, #1284) with no live scrape. */
  via: "supplied" | "firecrawl" | "fetch" | "snapshot";
  windows: number;
  cappedAtWindow: boolean;
  droppedChars: number;
  /** Pre-dedup count of extracted entries. */
  extracted: number;
  /** Unique-by-url count submitted to ingest. */
  deduped: number;
  dateRange: { from: string | null; to: string | null };
  /** Rows seen by ingest (0 on dryRun). */
  found: number;
  /** Rows actually inserted (0 on dryRun). */
  inserted: number;
  dryRun: boolean;
  /** Set only when the Firecrawl window ceiling reduced a deeper request and the
   *  run stopped with untouched tail — tells the caller how to go deeper. */
  guidance?: string;
  /** Present on reextract-source: which stored snapshot the body came from. */
  snapshot?: {
    id: string;
    contentHash: string;
    capturedAt: string;
    bytes: number;
    format: string;
  };
}

/**
 * Async-dispatch shape returned (HTTP 202) by POST /v1/workflows/backfill-source
 * when a deep Firecrawl backfill is routed to the durable BackfillSourceWorkflow
 * (#1281/#1282). The caller polls {@link getBackfillStatus} until terminal.
 */
export interface BackfillAsyncResponse {
  instanceId: string;
  async: true;
  statusUrl: string;
}

/** Discriminate the 202 async-dispatch shape from a synchronous report. */
export function isBackfillAsync(
  res: SourceBackfillReport | BackfillAsyncResponse,
): res is BackfillAsyncResponse {
  return (res as BackfillAsyncResponse).async === true;
}

/**
 * Cloudflare Workflows status (`WorkflowInstance.status()`), passed through by
 * GET /v1/workflows/backfill-source/status/:instanceId. Terminal states are
 * `complete | errored | terminated`; on `complete`, `output` is the report.
 * `status` is typed as string to stay forward-compatible with new CF values.
 */
export interface BackfillStatusResponse {
  instanceId: string;
  status: string;
  output?: SourceBackfillReport;
  error?: unknown;
  [k: string]: unknown;
}

/**
 * Full-history backfill for a windowed scrape source. The endpoint rejects bare
 * slugs (ambiguous across orgs, #690), so callers must pass the typed `src_…`
 * ID — resolve via {@link findSource} first.
 *
 * Returns the report synchronously for supplied-markdown / plain-fetch sources;
 * deep Firecrawl backfills return {@link BackfillAsyncResponse} (202) — poll
 * {@link getBackfillStatus}. Use {@link isBackfillAsync} to discriminate.
 */
export async function backfillSource(body: {
  sourceId: string;
  markdown?: string;
  maxWindows?: number;
  dryRun: boolean;
}): Promise<SourceBackfillReport | BackfillAsyncResponse> {
  return apiFetch<SourceBackfillReport | BackfillAsyncResponse>("/v1/workflows/backfill-source", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * Poll a durable backfill workflow's status. Returns `null` on a 404
 * (`instance_not_found`). For an instance we just dispatched, that's the brief
 * create→status race, so callers keep polling rather than hard-failing; a
 * persistent null means a wrong or expired instance ID.
 */
export async function getBackfillStatus(
  instanceId: string,
): Promise<BackfillStatusResponse | null> {
  return apiFetch<BackfillStatusResponse | null>(
    `/v1/workflows/backfill-source/status/${encodeURIComponent(instanceId)}`,
  );
}

/**
 * Re-extract releases from a stored raw snapshot (`released-raw`, #1284) — no
 * live scrape, no Firecrawl credits, deterministic input. Always synchronous.
 * Returns the standard {@link SourceBackfillReport} with `via: "snapshot"` and a
 * `snapshot` block identifying which capture was used. Like {@link backfillSource}
 * the endpoint rejects bare slugs — pass the typed `src_…` ID.
 */
export async function reextractSource(body: {
  sourceId: string;
  snapshotId?: string;
  maxWindows?: number;
  dryRun: boolean;
}): Promise<SourceBackfillReport> {
  return apiFetch<SourceBackfillReport>("/v1/workflows/reextract-source", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

// ── Batch overview workflow (admin-only) ──

/** Trigger body for POST /v1/workflows/batch-overview — mirrors `BatchOverviewBody` on the API worker. */
export interface BatchOverviewTriggerBody {
  minNewReleases?: number;
  minOverviewAgeDays?: number;
  maxCandidates?: number;
  orgs?: string[];
  maxCostUsd?: number;
}

export interface BatchOverviewTriggerResponse {
  instanceId: string;
  statusUrl: string;
}

/**
 * Cloudflare Workflows surfaces a small enum on `WorkflowInstance.status()`.
 * Terminal states are `complete | errored | terminated`; pre-terminal states
 * are `queued | running | paused`. We type the field as string to stay
 * forward-compatible with any new values CF introduces.
 */
export interface BatchOverviewStatusResponse {
  instanceId: string;
  status: string;
  output?: unknown;
  error?: unknown;
  [k: string]: unknown;
}

export async function triggerBatchOverview(
  body: BatchOverviewTriggerBody,
): Promise<BatchOverviewTriggerResponse> {
  return apiFetch<BatchOverviewTriggerResponse>("/v1/workflows/batch-overview", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function getBatchOverviewStatus(
  instanceId: string,
): Promise<BatchOverviewStatusResponse> {
  // apiFetch returns null on 404 for GETs. The status route 404s with
  // `instance_not_found` when the workflow ID is wrong (or briefly during
  // the create→status race window). Throw so callers reading `.status`
  // can't crash silently.
  const res = await apiFetch<BatchOverviewStatusResponse | null>(
    `/v1/workflows/batch-overview/status/${encodeURIComponent(instanceId)}`,
  );
  if (res === null) {
    throw new Error(`Workflow instance not found: ${instanceId}`);
  }
  return res;
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

export async function deleteSources(
  sources: Array<Pick<Source, "id">>,
  opts?: { hard?: boolean },
): Promise<void> {
  await Promise.all(sources.map((s) => deleteSource(s, opts)));
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
