import type { LatestRelease, ReleaseWithSource, SearchReleaseHit } from "../../api/types.js";
import { cleanExcerpt } from "../../lib/release-display.js";

/**
 * Slim JSON projectors for the release reader commands (`get` / `search` /
 * `latest`). The default shape drops storage/pipeline internals and redundant
 * title variants so agents spend fewer tokens; `--full` returns the complete
 * unprojected payload the CLI received.
 */

/** The live `/v1/releases/:id` payload carries fields not on the stale
 *  `ReleaseWithSource` interface (org, sourceType). Read them defensively. */
type RawReleaseDetail = ReleaseWithSource & {
  org?: { slug: string; name: string } | null;
  sourceType?: string | null;
};

function nullIfEmpty(s: string | null | undefined): string | null {
  return s?.trim() || null;
}

function omitUndefined<T extends Record<string, unknown>>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export function slimReleaseDetail(
  rel: ReleaseWithSource,
  opts: { contentChars: number; contentTokens: number; full: boolean },
): unknown {
  if (opts.full) {
    return { ...rel, contentChars: opts.contentChars, contentTokens: opts.contentTokens };
  }
  const r = rel as RawReleaseDetail;
  const excerpt = cleanExcerpt(r.content);
  return omitUndefined({
    id: r.id,
    version: nullIfEmpty(r.version) ?? undefined,
    title: r.title,
    summary: nullIfEmpty(r.summary),
    excerpt: excerpt || undefined,
    url: r.url ?? undefined,
    publishedAt: r.publishedAt,
    source: { slug: r.sourceSlug ?? "", name: r.sourceName ?? "" },
    org: r.org ? { slug: r.org.slug, name: r.org.name } : undefined,
    contentChars: opts.contentChars || undefined,
    contentTokens: opts.contentTokens || undefined,
  });
}

export function slimSearchHit(hit: SearchReleaseHit, full: boolean): unknown {
  if (full) return hit;
  const excerpt = cleanExcerpt(hit.content) || cleanExcerpt(hit.summary);
  const chars = hit.content?.length ?? 0;
  return omitUndefined({
    id: hit.id,
    version: nullIfEmpty(hit.version) ?? undefined,
    title: hit.title,
    summary: nullIfEmpty(hit.summary),
    excerpt: excerpt || undefined,
    publishedAt: hit.publishedAt,
    source: { slug: hit.sourceSlug, name: hit.sourceName },
    org: hit.orgSlug ? { slug: hit.orgSlug, name: hit.orgName ?? undefined } : undefined,
    contentChars: chars || undefined,
  });
}

export function slimLatest(row: LatestRelease, full: boolean): unknown {
  if (full) return row;
  return omitUndefined({
    id: row.id,
    version: nullIfEmpty(row.version) ?? undefined,
    title: row.title,
    summary: nullIfEmpty(row.summary),
    publishedAt: row.publishedAt,
    source: { slug: row.sourceSlug, name: row.sourceName },
    contentChars: row.contentChars ?? undefined,
    contentTokens: row.contentTokens ?? undefined,
  });
}
