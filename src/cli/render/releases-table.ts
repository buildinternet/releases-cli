import chalk from "chalk";
import { stripAnsi } from "../../lib/sanitize.js";
import {
  type ReleaseRow,
  relativeDate,
  releaseIdentity,
  releaseDescription,
  cleanExcerpt,
} from "../../lib/release-display.js";
import { renderTable } from "./table.js";

export type ReleaseRowMode = "feed" | "search";

export interface RenderReleaseRowsOptions {
  mode?: ReleaseRowMode;
  isTTY?: boolean;
  maxWidth?: number;
}

/** Collapse whitespace (incl. tabs/newlines) to single spaces so a search
 *  title can't break the one-row-per-release TSV/TTY contract. The `feed`
 *  description already runs through `cleanExcerpt`, which collapses too. */
function singleLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Shared renderer for the `latest` feed and the `search` releases section.
 * Both produce the same column-aligned grid (identity / description / age /
 * dimmed id); `search` puts the release title in the description column and
 * adds a cleaned, markdown-stripped excerpt as an aligned continuation line
 * (TTY only). `feed` uses the summary→…→title fallback as the description and
 * has no continuation. Non-TTY: feed → bare TSV; search → one plain line/hit.
 */
export function renderReleaseRows(rows: ReleaseRow[], opts: RenderReleaseRowsOptions = {}): string {
  const mode = opts.mode ?? "feed";
  if (rows.length === 0) return "";

  const isTTY = opts.isTTY ?? Boolean(process.stdout?.isTTY);

  // Machine path: bare TSV, one row per release, no color, no excerpt
  // continuation. id-first with ISO dates and a version column so pipelines
  // (`cut -f1`) stay stable — distinct from the TTY layout, which dims the id
  // last and shows relative age. `--json` remains the richest machine format.
  if (!isTTY) {
    return rows
      .map((r) => {
        const identity = stripAnsi(releaseIdentity(r));
        const description =
          mode === "search" ? singleLine(stripAnsi(r.title)) : stripAnsi(releaseDescription(r));
        return [r.id, identity, description, r.version ?? "", r.publishedAt ?? ""].join("\t");
      })
      .join("\n");
  }

  const head = [
    { label: "Item", noTruncate: true },
    { label: "Description" },
    { label: "Age", noTruncate: true },
    { label: "ID", noTruncate: true },
  ];

  const tableRows = rows.map((r) => {
    const identity = stripAnsi(releaseIdentity(r));
    const description = mode === "search" ? singleLine(stripAnsi(r.title)) : releaseDescription(r);
    const age = relativeDate(r.publishedAt);
    return [identity, description, age, chalk.dim(r.id)];
  });

  const subRows =
    mode === "search"
      ? rows.map((r) => {
          const ex = cleanExcerpt(r.summary) || cleanExcerpt(r.content);
          if (!ex) return null;
          // Drop the continuation when it just repeats the title (common when
          // the summary IS the title) — pure noise in the scanning path.
          const title = cleanExcerpt(r.title) || r.title;
          if (ex.toLowerCase() === title.toLowerCase()) return null;
          return chalk.dim(ex);
        })
      : undefined;

  return renderTable({
    head,
    rows: tableRows,
    subRows,
    showHeader: false,
    isTTY: true,
    maxWidth: opts.maxWidth,
  });
}
