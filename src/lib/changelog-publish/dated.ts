/**
 * Date-sectioned changelog parser.
 *
 * Vendored from buildinternet/releases `scripts/changelog/changelog-md.ts`
 * (parse half only; SHA 6a36a5652b0f40c95305b81cc4d5547d146c62bf). The
 * publish-changelog Action planner calls this for `## Month D, YYYY`
 * headings. It is not part of the published `@buildinternet/releases-core`
 * package.
 *
 * TODO(#2377): drop this copy when the shared changelog publish planner
 * lands on npm and re-exports the date parser. Do not fork the grammar.
 */

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export interface ChangelogSection {
  dateIso: string; // "2026-06-10"
  title: string; // "June 10, 2026"
  body: string; // "**Added**\n- ..."
}

export function titleToIso(title: string): string | null {
  const m = title.trim().match(/^(\w+)\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m || m[1] === undefined || m[2] === undefined || m[3] === undefined) return null;
  const monthIdx = MONTHS.indexOf(m[1]);
  if (monthIdx < 0) return null;
  const mm = String(monthIdx + 1).padStart(2, "0");
  const dd = String(Number(m[2])).padStart(2, "0");
  return `${m[3]}-${mm}-${dd}`;
}

const HEADING = /^##(?!#)\s+(.+?)\s*$/;

export function parseChangelog(markdown: string): ChangelogSection[] {
  const lines = markdown.split("\n");
  const heads: { line: number; title: string; dateIso: string }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line === undefined) continue;
    const m = line.match(HEADING);
    if (!m || m[1] === undefined) continue;
    const iso = titleToIso(m[1]);
    if (!iso) continue; // skip non-date level-2 headings
    heads.push({ line: i, title: m[1].trim(), dateIso: iso });
  }
  const out: ChangelogSection[] = [];
  for (let h = 0; h < heads.length; h++) {
    const head = heads[h];
    const next = heads[h + 1];
    if (!head) continue;
    const start = head.line + 1;
    const end = next ? next.line : lines.length;
    out.push({
      dateIso: head.dateIso,
      title: head.title,
      body: lines.slice(start, end).join("\n").trim(),
    });
  }
  return out;
}
