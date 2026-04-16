import { Command } from "commander";
import chalk from "chalk";
import { logger } from "@releases/lib/logger";
import { registerOnboardApplyCommand } from "./onboard-apply.js";
import { apiFetch } from "../../api/client.js";
import { getApiUrl } from "../../lib/mode.js";

interface OnboardOpts {
  domain?: string;
  githubOrg?: string;
  json?: boolean;
  managedAgents?: boolean;
  sandbox?: boolean;
}

type DiscoveryEngine = "managed-agents" | "sandbox";

function resolveDiscoveryEngine(opts: OnboardOpts): DiscoveryEngine {
  if (opts.managedAgents) return "managed-agents";
  if (opts.sandbox) return "sandbox";
  const env = process.env.RELEASED_DISCOVERY_ENGINE?.toLowerCase();
  if (env === "sandbox") return "sandbox";
  return "managed-agents";
}

interface DiscoverySource {
  slug: string;
  url: string;
  type: string;
  confidence: "high" | "medium" | "low";
  validated?: boolean;
  validationError?: string;
  releaseCount?: number;
  duplicateOf?: string;
}

interface DiscoveryState {
  product: string;
  domain?: string;
  githubOrg?: string;
  sources: DiscoverySource[];
  status: string;
}

export function registerOnboardCommand(program: Command) {
  const onboard = program
    .command("onboard")
    .description("Discover and onboard changelog sources for a company (remote)")
    .argument("<company>", "Company or product name to discover sources for")
    .option("--domain <domain>", "Seed with the company's domain")
    .option("--github-org <org>", "Seed with the company's GitHub organization")
    .option("--managed-agents", "Use the managed-agents discovery engine (default)")
    .option("--sandbox", "Use the legacy sandbox discovery engine")
    .option("--json", "Output results as JSON")
    .action(async (company: string, opts: OnboardOpts) => {
      if (opts.managedAgents && opts.sandbox) {
        logger.error("Cannot specify both --managed-agents and --sandbox");
        process.exit(1);
      }

      const engine = resolveDiscoveryEngine(opts);
      await runRemoteDiscovery(company, opts, engine);
    });

  registerOnboardApplyCommand(onboard);
}

async function runRemoteDiscovery(
  company: string,
  opts: OnboardOpts,
  engine: DiscoveryEngine = "managed-agents",
): Promise<void> {
  if (!opts.json) {
    process.stderr.write(
      chalk.bold(`Onboarding "${company}"`) +
        chalk.gray(` — starting remote discovery on ${getApiUrl()}...\n\n`),
    );
  }

  let sessionId: string;
  try {
    const result = await apiFetch<{ sessionId: string }>("/v1/discover", {
      method: "POST",
      body: JSON.stringify({ company, domain: opts.domain, githubOrg: opts.githubOrg, engine }),
    });
    sessionId = result.sessionId;
  } catch (err) {
    logger.error(`Failed to start remote discovery: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  if (!opts.json) {
    process.stderr.write(chalk.gray(`  Session: ${sessionId}\n`));
  }

  const POLL_INTERVAL = 5_000;
  const MAX_POLL_TIME = 15 * 60 * 1000;
  const startTime = Date.now();
  let lastStep = "";

  while (Date.now() - startTime < MAX_POLL_TIME) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    let status: {
      status: "running" | "complete" | "error" | "idle";
      progress?: { step: string; sourcesFound: number; sourcesValidated: number; currentAction: string };
      result?: object;
      error?: string;
    };
    try {
      status = await apiFetch(`/v1/discover/${sessionId}`);
    } catch (err) {
      logger.error(`Failed to poll status: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    }

    if (status.status === "complete") {
      if (!opts.json) process.stderr.write(chalk.green("\n  Discovery complete.\n"));

      if (status.result) {
        if (opts.json) {
          console.log(JSON.stringify(status.result, null, 2));
          return;
        }

        const result = status.result as Record<string, unknown>;
        if (result.sources && Array.isArray(result.sources)) {
          printSummary(result as unknown as DiscoveryState);
        } else {
          const found = result.sourcesFound ?? 0;
          const validated = result.sourcesValidated ?? 0;
          process.stderr.write(chalk.gray(`  ${found} source(s) found, ${validated} validated\n`));
        }
      }
      return;
    }

    if (status.status === "error") {
      logger.error(`Remote discovery failed: ${status.error ?? "Unknown error"}`);
      process.exit(1);
    }

    if (!opts.json && status.progress) {
      const { step, sourcesFound, sourcesValidated, currentAction } = status.progress;
      if (step !== lastStep) {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        process.stderr.write(
          chalk.gray(`  [${elapsed}s] `) +
            chalk.dim(`${step}`) +
            chalk.gray(` — ${sourcesFound} found, ${sourcesValidated} validated`) +
            (currentAction ? chalk.dim(` — ${currentAction}`) : "") +
            "\n",
        );
        lastStep = step;
      }
    }
  }

  logger.error("Remote discovery timed out after 15 minutes.");
  process.exit(1);
}

function printSummary(state: DiscoveryState): void {
  const { sources } = state;
  const write = (s: string) => process.stderr.write(s + "\n");

  write("");
  write(chalk.bold(`Discovery results for ${state.product}`));
  write("");

  if (state.domain) write(chalk.gray(`  Domain: ${state.domain}`));
  if (state.githubOrg) write(chalk.gray(`  GitHub: ${state.githubOrg}`));

  if (sources.length === 0) {
    write(chalk.yellow("\n  No sources discovered."));
    return;
  }

  const validated = sources.filter((s) => s.validated);
  const failed = sources.filter((s) => s.validationError);

  write(chalk.gray(`  ${sources.length} source(s) found, ${validated.length} validated, ${failed.length} failed`));
  write("");

  for (const s of sources) {
    const conf =
      s.confidence === "high"
        ? chalk.green(s.confidence)
        : s.confidence === "medium"
          ? chalk.yellow(s.confidence)
          : chalk.red(s.confidence);
    const status = s.validationError
      ? chalk.red("failed")
      : s.validated
        ? chalk.green(`${s.releaseCount ?? 0} releases`)
        : chalk.gray("not validated");
    const dup = s.duplicateOf ? chalk.dim(` (dup of ${s.duplicateOf})`) : "";

    write(`  ${chalk.cyan(s.slug)} ${chalk.dim(s.type)} ${conf} — ${status}${dup}`);
    write(chalk.dim(`    ${s.url}`));
  }

  write(chalk.dim(`\n  Status: ${state.status}`));
}
