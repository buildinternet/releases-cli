import chalk from "chalk";
import type { LatestRelease } from "../../api/types.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { renderTable } from "./table.js";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

/**
 * Compact token-count formatter — "1.5K", "12K", "87". `null` / `0` / missing
 * → empty string so the renderer can `${size ? ` ${size}` : ""}` without a
 * branch. Mirrors how Sentry and OpenAI's chat surfaces show "tokens".
 */
function formatTokenCount(n: number | null | undefined): string {
  if (!n || n < 0) return "";
  if (n < 1000) return `~${n} tokens`;
  if (n < 100_000) return `~${(n / 1000).toFixed(1).replace(/\.0$/, "")}K tokens`;
  return `~${Math.round(n / 1000)}K tokens`;
}

export interface RenderOptions {
  /** Append a dimmed summary preview under each title (for tail/latest listings). */
  withSummary?: boolean;
}

export function renderLatestReleasesTable(rows: LatestRelease[], opts: RenderOptions = {}): string {
  return renderTable({
    head: [
      { label: "ID", noTruncate: true },
      { label: "Source" },
      { label: "Title" },
      { label: "Version", noTruncate: true },
      { label: opts.withSummary ? "Published At" : "Published", noTruncate: true },
    ],
    rows: rows.map((row) => {
      const title = stripAnsi(row.title);
      // Append size hint to the title cell when present so the field doesn't
      // need its own column. Skip in compact mode unless body is large enough
      // to matter (~1K tokens) — small releases would just add noise. #958.
      //
      // `contentTokens` is declared on `LatestRelease` from api-types ≥0.19;
      // the CLI's pin (^0.16) accepts older shapes too, so the cast keeps
      // the renderer running before the registry publishes the field. Older
      // payloads land `undefined` and the hint is dropped.
      const contentTokens = (row as LatestRelease & { contentTokens?: number | null })
        .contentTokens;
      const sizeHint = formatTokenCount(contentTokens);
      const showSize = sizeHint && (opts.withSummary || (contentTokens ?? 0) >= 1000);
      const titleWithSize = showSize ? `${title} ${chalk.dim(sizeHint)}` : title;
      const titleCell =
        opts.withSummary && row.summary
          ? `${titleWithSize}\n${chalk.dim(truncate(row.summary, 120))}`
          : titleWithSize;
      const publishedCell = opts.withSummary
        ? (row.publishedAt ?? "-")
        : (row.publishedAt?.slice(0, 10) ?? chalk.dim("—"));

      let versionCell: string;
      if (row.version) versionCell = stripAnsi(row.version);
      else if (opts.withSummary) versionCell = "-";
      else versionCell = chalk.dim("—");

      return [
        chalk.dim(row.id),
        `${stripAnsi(row.sourceName)} ${chalk.dim(`(${row.sourceSlug})`)}`,
        titleCell,
        versionCell,
        publishedCell,
      ];
    }),
  });
}
