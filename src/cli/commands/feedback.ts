import { Command } from "commander";
import chalk from "chalk";
import { createInterface } from "node:readline/promises";
import { getApiUrl } from "../../lib/mode.js";
import { writeJson } from "../../lib/output.js";
import { RELEASES_CLI_UA } from "../../lib/user-agent.js";
import { VERSION } from "../version.js";
import { isTelemetryEnabled, getOrCreateAnonId } from "../../lib/telemetry.js";
import { apiFetch } from "../../api/client.js";
import { stripAnsi } from "../../lib/sanitize.js";
import { logger } from "@releases/lib/logger";

const MIN_MESSAGE = 5;
const MAX_MESSAGE = 4000;
const POST_TIMEOUT_MS = 10_000;
const FEEDBACK_TYPES = ["bug", "idea", "other"] as const;
const FEEDBACK_TYPES_SET = new Set<string>(FEEDBACK_TYPES);
const ISSUES_URL = "https://github.com/buildinternet/releases-cli/issues";

export type ValidateResult = { ok: true; message: string } | { ok: false; error: string };

export function validateMessage(raw: string): ValidateResult {
  const message = raw.trim();
  if (message.length < MIN_MESSAGE) {
    return { ok: false, error: "Feedback is too short — add a sentence or two." };
  }
  if (message.length > MAX_MESSAGE) {
    return { ok: false, error: `Feedback is too long (max ${MAX_MESSAGE} chars).` };
  }
  return { ok: true, message };
}

function detectRuntime(): string {
  const bun = (globalThis as { Bun?: { version?: string } }).Bun;
  if (bun?.version) return `bun-${bun.version}`;
  if (typeof process !== "undefined" && process.versions?.node) {
    return `node-${process.versions.node}`;
  }
  return "unknown";
}

export interface FeedbackPayload {
  message: string;
  type: string;
  contact?: string;
  cliVersion: string;
  clientKind: string;
  anonId?: string;
  os: string;
  arch: string;
  runtime: string;
  surface: "cli";
}

export function buildFeedbackPayload(
  message: string,
  opts: { type?: string; contact?: string },
  telemetry: { telemetryEnabled: boolean; anonId: string },
): FeedbackPayload {
  const type = opts.type && FEEDBACK_TYPES_SET.has(opts.type) ? opts.type : "general";
  return {
    message,
    type,
    contact: opts.contact?.trim() || undefined,
    cliVersion: VERSION,
    clientKind:
      process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true"
        ? "internal-ci"
        : "external",
    anonId: telemetry.telemetryEnabled ? telemetry.anonId : undefined,
    os: process.platform,
    arch: process.arch,
    runtime: detectRuntime(),
    surface: "cli",
  };
}

/**
 * Resolve the telemetry context for the payload. Only touches the anon-id file
 * when telemetry is enabled — calling getOrCreateAnonId() unconditionally would
 * create and persist an ID even for users who have opted out of telemetry.
 * Deps are injectable for testing.
 */
export function resolveTelemetry(deps?: { isEnabled?: () => boolean; getAnonId?: () => string }): {
  telemetryEnabled: boolean;
  anonId: string;
} {
  const isEnabled = deps?.isEnabled ?? isTelemetryEnabled;
  const getAnonId = deps?.getAnonId ?? getOrCreateAnonId;
  const telemetryEnabled = isEnabled();
  return { telemetryEnabled, anonId: telemetryEnabled ? getAnonId() : "" };
}

async function resolveMessage(arg: string | undefined): Promise<string | null> {
  if (arg && arg.trim()) return arg;
  if (!process.stdin.isTTY) {
    const piped = (await Bun.stdin.text()).trim();
    return piped.length ? piped : null;
  }
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(
      chalk.bold("What's your feedback? ") + chalk.dim("(blank to cancel)\n> "),
    );
    return answer.trim().length ? answer : null;
  } finally {
    rl.close();
  }
}

async function resolveContact(provided: string | undefined): Promise<string | undefined> {
  if (provided) return provided;
  if (!process.stdin.isTTY) return undefined;
  const rl = createInterface({ input: process.stdin, output: process.stderr });
  try {
    const answer = await rl.question(chalk.dim("Contact (optional, blank to skip)\n> "));
    return answer.trim().length ? answer.trim() : undefined;
  } finally {
    rl.close();
  }
}

async function postFeedback(
  payload: FeedbackPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), POST_TIMEOUT_MS);
  try {
    const res = await fetch(`${getApiUrl()}/v1/feedback`, {
      method: "POST",
      headers: { "content-type": "application/json", "User-Agent": RELEASES_CLI_UA },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, error: `server returned ${res.status}` };
    const json = (await res.json()) as { ok?: boolean; id?: string };
    if (!json.ok || !json.id) return { ok: false, error: "unexpected response" };
    return { ok: true, id: json.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timer);
  }
}

export function registerFeedbackCommand(parent: Command): void {
  parent
    .command("feedback")
    .description("Send feedback about the releases CLI")
    .argument("[message]", "Feedback text (omit to type interactively or pipe via stdin)")
    .option("--contact <value>", "How to reach you for follow-up (optional)")
    .option("--type <type>", "bug | idea | other")
    .option("--json", "Output as JSON")
    .option("--dry-run", "Print the payload without sending")
    .action(
      async (
        messageArg: string | undefined,
        opts: { contact?: string; type?: string; json?: boolean; dryRun?: boolean },
      ) => {
        if (opts.type && !FEEDBACK_TYPES_SET.has(opts.type)) {
          logger.error(`--type must be one of: ${FEEDBACK_TYPES.join(", ")}`);
          process.exit(1);
        }

        const raw = await resolveMessage(messageArg);
        if (raw === null) {
          logger.info(chalk.dim("Cancelled — no feedback sent."));
          process.exit(0);
        }
        const validated = validateMessage(raw);
        if (!validated.ok) {
          logger.error(validated.error);
          process.exit(1);
        }

        const contact = await resolveContact(opts.contact);
        const payload = buildFeedbackPayload(
          validated.message,
          { type: opts.type, contact },
          resolveTelemetry(),
        );

        if (opts.dryRun) {
          if (opts.json) await writeJson({ dryRun: true, payload });
          else logger.info(chalk.dim("[dry-run] would POST:\n") + JSON.stringify(payload, null, 2));
          return;
        }

        const result = await postFeedback(payload);
        if (result.ok) {
          if (opts.json) await writeJson({ ok: true, id: result.id });
          else
            logger.info(
              chalk.green("Thanks — feedback received ") + chalk.dim(`(id: ${result.id})`),
            );
          return;
        }
        if (opts.json) await writeJson({ ok: false, error: result.error });
        else {
          logger.error(`Couldn't send feedback: ${result.error}`);
          logger.info(chalk.dim(`You can open an issue instead: ${ISSUES_URL}`));
        }
        process.exit(1);
      },
    );
}

interface FeedbackRow {
  id: string;
  createdAt: number;
  message: string;
  contact: string | null;
  type: string;
  status: string;
}
interface FeedbackListResponse {
  items: FeedbackRow[];
  nextCursor: string | null;
}

export function registerFeedbackAdminCommand(parent: Command): void {
  const cmd = parent.command("feedback").description("Inspect submitted CLI feedback");

  cmd
    .command("list")
    .description("List submitted feedback (newest first)")
    .option("--status <status>", "Filter by status: new | triaged | closed")
    .option("--type <type>", "Filter by type: bug | idea | other | general")
    .option("--limit <n>", "Max rows (default 50)")
    .option("--cursor <cursor>", "Pagination cursor from a previous page")
    .option("--json", "Output as JSON")
    .action(
      async (opts: {
        status?: string;
        type?: string;
        limit?: string;
        cursor?: string;
        json?: boolean;
      }) => {
        const qs = new URLSearchParams();
        if (opts.status) qs.set("status", opts.status);
        if (opts.type) qs.set("type", opts.type);
        if (opts.limit) qs.set("limit", opts.limit);
        if (opts.cursor) qs.set("cursor", opts.cursor);
        const data = await apiFetch<FeedbackListResponse>(
          `/v1/admin/feedback${qs.size ? `?${qs}` : ""}`,
        );

        if (opts.json) {
          await writeJson(data);
          return;
        }
        if (!data.items.length) {
          logger.info(chalk.dim("No feedback yet."));
          return;
        }
        for (const r of data.items) {
          // Defense-in-depth: the API strips control chars at ingest, but
          // stripAnsi here protects the operator's terminal from any
          // pre-existing or otherwise-ingested rows that carry escapes.
          const when = new Date(r.createdAt).toISOString().slice(0, 16).replace("T", " ");
          const head = `${chalk.bold(r.id)}  ${chalk.dim(when)}  ${chalk.cyan(r.type)}/${r.status}`;
          const contact = r.contact ? chalk.dim(` <${stripAnsi(r.contact)}>`) : "";
          logger.info(`${head}${contact}`);
          logger.info(`  ${stripAnsi(r.message).replace(/\s+/g, " ").slice(0, 200)}`);
        }
        if (data.nextCursor) {
          logger.info(chalk.dim(`More: releases admin feedback list --cursor ${data.nextCursor}`));
        }
      },
    );
}
