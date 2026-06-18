import { getApiUrl, getApiKey, isAdminMode } from "../lib/mode.js";
import { shouldRecordMutation, recordMutation } from "../lib/mutation-log.js";
import { RELEASES_CLI_UA } from "../lib/user-agent.js";
import type { LatestRelease, MediaItem } from "./types.js";
import { type ListResponse } from "@buildinternet/releases-core/cli-contracts";

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
} from "@buildinternet/releases-api-types";
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
    const detail = err instanceof Error ? err.message : String(err);
    throw new Error(`API request failed on ${opts?.method ?? "GET"} ${path}: ${detail}`, {
      cause: err,
    });
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

  // 204 No Content (e.g. DELETE) has an empty body; res.json() would throw.
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const SCOPE_RESOURCE = { org: "orgs", product: "products" } as const;

export function toMediaItems(
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
export type LatestReleaseWire = {
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
export function toLatestRelease(r: LatestReleaseWire): LatestRelease {
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

export async function suggestEntities(
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
