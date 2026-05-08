import chalk from "chalk";
import type { LatestRelease } from "../../api/types.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { renderTable } from "./table.js";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

export interface RenderOptions {
  /** Append a dimmed summary preview under each title (for tail/latest listings). */
  withSummary?: boolean;
}

export function renderLatestReleasesTable(rows: LatestRelease[], opts: RenderOptions = {}): string {
  return renderTable({
    head: [
      { label: "ID" },
      { label: "Source" },
      { label: "Title" },
      { label: "Version", noTruncate: true },
      { label: opts.withSummary ? "Published At" : "Published", noTruncate: true },
    ],
    rows: rows.map((row) => {
      const title = stripAnsi(row.title);
      const titleCell =
        opts.withSummary && row.contentSummary
          ? `${title}\n${chalk.dim(truncate(row.contentSummary, 120))}`
          : title;
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
