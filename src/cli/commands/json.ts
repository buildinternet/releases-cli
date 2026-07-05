import { Command } from "commander";
import chalk from "chalk";
import { existsSync } from "node:fs";
import {
  ReleasesJsonConfigSchema,
  ReleasesJsonDomainSchema,
  ReleasesJsonRepoSchema,
} from "@buildinternet/releases-api-types";
import { logger } from "@releases/lib/logger";
import { readContentArg } from "../../lib/input.js";
import { writeJson } from "../../lib/output.js";

// The owner-declared manifest documented at https://releases.sh/docs/listing.
// Two hosting scopes share one public union schema (ReleasesJsonConfigSchema):
//   - domain: /.well-known/releases.json — flat org identity + products[]
//   - repo:   repo-root releases.json    — product binding + repo releases[]
// See buildinternet/releases#1908 (v2 manifest) / releases-cli#351.

type Scope = "domain" | "repo";

interface Issue {
  path: string;
  message: string;
  code: string;
}

interface ValidateResult {
  target: string;
  valid: boolean;
  scope: Scope | null;
  issues: Issue[];
  summary?: DomainSummary | RepoSummary;
}

interface DomainSummary {
  scope: "domain";
  name: string | null;
  category: string | null;
  products: number;
  releaseLocations: number;
  registryBinding: RegistryBinding | null;
}

interface RepoSummary {
  scope: "repo";
  product: string | null;
  releaseLocations: number;
  registryBinding: RegistryBinding | null;
}

interface RegistryBinding {
  org: string | null;
  product: string | null;
  verification: boolean;
}

// A bare hostname (no scheme, path, port, or query) — the future `domain` form.
// A local file argument almost always carries a `.`-json suffix, a path
// separator, or is `-`, so this only misfires on a dotted, slash-free,
// non-existent argument, which is exactly the domain intent.
const HOSTNAME_RE =
  /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i;

function looksLikeDomain(target: string): boolean {
  if (target === "-") return false;
  if (target.includes("/") || target.includes("\\")) return false;
  // A `.json` argument is always a file — even a missing one — so a typo'd path
  // surfaces a clean "cannot read file" instead of the domain-deferred notice.
  if (target.toLowerCase().endsWith(".json")) return false;
  if (existsSync(target)) return false;
  return HOSTNAME_RE.test(target);
}

// Domain-only top-level keys. Their presence disambiguates the union so a
// mis-typed file gets errors from the scope it clearly intended rather than the
// noisy "matched neither branch" union failure.
const DOMAIN_KEYS = new Set([
  "name",
  "description",
  "category",
  "avatar",
  "tags",
  "social",
  "products",
]);

function detectScope(data: unknown): Scope {
  if (typeof data !== "object" || data === null) return "domain";
  const keys = Object.keys(data as Record<string, unknown>);
  if (keys.includes("product")) return "repo";
  if (keys.some((k) => DOMAIN_KEYS.has(k))) return "domain";
  return "domain";
}

function scopeSchema(
  scope: Scope,
): typeof ReleasesJsonDomainSchema | typeof ReleasesJsonRepoSchema {
  return scope === "repo" ? ReleasesJsonRepoSchema : ReleasesJsonDomainSchema;
}

// Structurally typed to sidestep the dual-zod version skew between this repo's
// pinned zod and the copy api-types resolves — we only read `path`/`message`/
// `code` off each issue.
interface ZodIssueLike {
  path: PropertyKey[];
  message: string;
  code: string;
}

function collectIssues(error: { issues: ZodIssueLike[] }): Issue[] {
  return error.issues.map((issue) => ({
    path: issue.path.length ? issue.path.map(String).join(".") : "(root)",
    message: issue.message,
    code: issue.code,
  }));
}

function countReleaseLocations(parsed: Record<string, unknown>): number {
  const top = Array.isArray(parsed.releases) ? parsed.releases.length : 0;
  const products = Array.isArray(parsed.products) ? parsed.products : [];
  const nested = products.reduce<number>((sum, product) => {
    const rel = (product as { releases?: unknown }).releases;
    return sum + (Array.isArray(rel) ? rel.length : 0);
  }, 0);
  return top + nested;
}

function registryBinding(parsed: Record<string, unknown>): RegistryBinding | null {
  const registries = parsed.registries as Record<string, unknown> | undefined;
  const entry = registries?.["releases.sh"] as Record<string, unknown> | undefined;
  if (!entry) return null;
  return {
    org: typeof entry.org === "string" ? entry.org : null,
    product: typeof entry.product === "string" ? entry.product : null,
    verification: typeof entry.verification === "string" && entry.verification.length > 0,
  };
}

function buildSummary(parsed: Record<string, unknown>): DomainSummary | RepoSummary {
  const binding = registryBinding(parsed);
  if ("product" in parsed) {
    const product = parsed.product as { name?: string; slug?: string } | undefined;
    return {
      scope: "repo",
      product: product?.slug ?? product?.name ?? null,
      releaseLocations: Array.isArray(parsed.releases) ? parsed.releases.length : 0,
      registryBinding: binding,
    };
  }
  return {
    scope: "domain",
    name: typeof parsed.name === "string" ? parsed.name : null,
    category: typeof parsed.category === "string" ? parsed.category : null,
    products: Array.isArray(parsed.products) ? parsed.products.length : 0,
    releaseLocations: countReleaseLocations(parsed),
    registryBinding: binding,
  };
}

function line(label: string, value: string): void {
  console.log(`  ${chalk.dim(label.padEnd(16))}${value}`);
}

function printSummary(summary: DomainSummary | RepoSummary): void {
  console.log(chalk.green("✓ valid releases.json") + chalk.dim(` (${summary.scope} scope)`));
  if (summary.scope === "domain") {
    if (summary.name) line("org", summary.name);
    if (summary.category) line("category", summary.category);
    line("products", String(summary.products));
  } else {
    line("product", summary.product ?? chalk.dim("(unbound)"));
  }
  line("release locators", String(summary.releaseLocations));
  const binding = summary.registryBinding;
  if (binding) {
    const parts: string[] = [];
    if (binding.org) parts.push(`org ${binding.org}`);
    if (binding.product) parts.push(`product ${binding.product}`);
    if (binding.verification) parts.push("verification set");
    line("releases.sh", parts.length ? parts.join(", ") : chalk.dim("(present, empty)"));
  }
}

function printIssues(target: string, scope: Scope, issues: Issue[]): void {
  console.log(chalk.red(`✗ invalid releases.json`) + chalk.dim(` (${scope} scope) — ${target}`));
  console.log("");
  for (const issue of issues) {
    console.log(`  ${chalk.yellow(issue.path)}  ${issue.message}`);
  }
  console.log("");
  console.log(
    chalk.dim(
      `${issues.length} issue${issues.length === 1 ? "" : "s"}. Schema: https://releases.sh/docs/listing`,
    ),
  );
}

async function runValidate(target: string, opts: { json?: boolean }): Promise<void> {
  if (looksLikeDomain(target)) {
    // The domain form fetches https://<domain>/.well-known/releases.json and
    // renders the materialization plan. Its verdict must come from the shared
    // web fast-lane backend (the public rate-limited dry-run endpoint) so web
    // and CLI never disagree — that endpoint is buildinternet/releases#1910 and
    // hasn't landed. Ship the local-file half first; keep the surface stable.
    const message =
      `Domain validation isn't available yet — it needs the public dry-run ` +
      `endpoint (buildinternet/releases#1910). ` +
      `For now, save the file locally and validate the path:\n` +
      `  curl -s https://${target}/.well-known/releases.json | releases json validate -`;
    if (opts.json) {
      await writeJson({
        target,
        valid: false,
        scope: null,
        issues: [],
        unsupported: "domain",
        message: message.replace(/\n\s*/g, " "),
      });
    } else {
      logger.error(message);
    }
    process.exit(2);
  }

  const raw = await readContentArg(target);

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (opts.json) {
      await writeJson({
        target,
        valid: false,
        scope: null,
        issues: [{ path: "(root)", message: `not valid JSON: ${detail}`, code: "invalid_json" }],
      });
    } else {
      logger.error(`Not valid JSON: ${detail}`);
    }
    process.exit(1);
  }

  const verdict = ReleasesJsonConfigSchema.safeParse(data);
  const scope = detectScope(data);

  if (verdict.success) {
    const summary = buildSummary(data as Record<string, unknown>);
    const result: ValidateResult = {
      target,
      valid: true,
      scope: summary.scope,
      issues: [],
      summary,
    };
    if (opts.json) {
      await writeJson(result);
    } else {
      printSummary(summary);
    }
    return;
  }

  // The union's own error nests both branches' failures, which is noise. Re-run
  // against the scope the file clearly intended for readable, path-anchored
  // messages.
  const scoped = scopeSchema(scope).safeParse(data);
  const issues = scoped.success ? collectIssues(verdict.error) : collectIssues(scoped.error);

  const result: ValidateResult = { target, valid: false, scope, issues };
  if (opts.json) {
    await writeJson(result);
  } else {
    printIssues(target, scope, issues);
  }
  process.exit(1);
}

export function registerJsonCommand(program: Command): void {
  const json = program
    .command("json")
    .description("Work with releases.json owner manifests")
    .showSuggestionAfterError(true)
    .action(() => {
      console.log(chalk.dim('Run "releases json --help" to see manifest commands.'));
    });

  json
    .command("validate")
    .description("Validate a releases.json manifest against the v2 schema")
    .argument("<target>", 'Path to a releases.json file, or "-" to read from stdin')
    .option("--json", "Machine-readable JSON output")
    .addHelpText(
      "after",
      `
Examples:
  $ releases json validate releases.json
  $ releases json validate ./path/to/.well-known/releases.json --json
  $ cat releases.json | releases json validate -

Validates either hosting scope (domain-hosted /.well-known/releases.json or a
repo-root releases.json). Exit code 0 when valid, 1 when invalid.
Docs: https://releases.sh/docs/listing`,
    )
    .action(async (target: string, opts: { json?: boolean }) => {
      await runValidate(target, opts);
    });
}
