import { Command } from "commander";
import chalk from "chalk";
import { logger } from "@releases/lib/logger";
import {
  apiFetch,
  getActiveSources,
  listFetchableSources,
  listSourcesWithChanges,
  findSource,
  findOrg,
  getSourcesByOrg,
} from "../../api/client.js";
import { newCorrelationId } from "@buildinternet/releases-core/id";
import { orgNotFound, sourceNotFound } from "../suggest.js";
import { writeJson, writeJsonLine } from "../../lib/output.js";

export function registerFetchCommand(program: Command) {
  program
    .command("fetch")
    .description(
      "Fetch releases from configured sources (delegated to a remote managed-agent session)",
    )
    .argument("[identifier]", "Source ID (src_...) or slug to fetch")
    .option("--source <identifier>", "Source ID or slug")
    .option("--json", "Output as JSON")
    .option("--unfetched", "Only fetch sources that have never been fetched")
    .option("--stale <hours>", "Only fetch sources older than N hours")
    .option("--changed", "Only fetch sources where poll detected upstream changes")
    .option("--retry-errors", "Only fetch sources whose last fetch was an error")
    .option("--org <slug>", "Fetch all active sources for an organization")
    .addHelpText(
      "after",
      `
Examples:
  releases admin source fetch src_abc123            Fetch a single source by ID
  releases admin source fetch my-source             Fetch a single source by slug
  releases admin source fetch --stale 6             Fetch sources not updated in 6+ hours
  releases admin source fetch --unfetched           Fetch sources never fetched before
  releases admin source fetch --changed             Fetch sources where poll detected changes
  releases admin source fetch --retry-errors        Retry sources that errored last time
  releases admin source fetch --org acme            Fetch all active sources for an org`,
    )
    .action(
      async (
        slugArg: string | undefined,
        opts: {
          source?: string;
          json?: boolean;
          unfetched?: boolean;
          stale?: string;
          changed?: boolean;
          retryErrors?: boolean;
          org?: string;
        },
      ) => {
        const identifier = slugArg ?? opts.source;

        let entries: Array<{ id: string; slug: string }> = [];
        let label = "manual fetch";
        let orgId: string | undefined;

        if (opts.org) {
          const org = await findOrg(opts.org);
          if (!org) return orgNotFound(opts.org);
          orgId = org.id;
          const activeSources = (await getSourcesByOrg(org.id)).filter(
            (s) => !s.isHidden && s.fetchPriority !== "paused",
          );
          if (activeSources.length === 0) {
            if (opts.json)
              await writeJsonLine({ sessionId: null, message: "No active sources" });
            else logger.info(`No active sources for ${org.name}.`);
            return;
          }
          entries = activeSources.map((s) => ({ id: s.id, slug: s.slug }));
          label = `all sources for ${org.slug} (${entries.length})`;
        } else if (identifier) {
          const src = await findSource(identifier);
          if (!src) return sourceNotFound(identifier);
          entries = [{ id: src.id, slug: src.slug }];
          if (src.orgId) orgId = src.orgId;
          label = src.slug;
        } else if (opts.unfetched) {
          const sources = await listFetchableSources({ mode: "unfetched" });
          entries = sources.map((s) => ({ id: s.id, slug: s.slug }));
          label = `${entries.length} unfetched sources`;
        } else if (opts.stale) {
          const hours = parseInt(opts.stale, 10);
          const sources = await listFetchableSources({ mode: "stale", staleHours: hours });
          entries = sources.map((s) => ({ id: s.id, slug: s.slug }));
          label = `${entries.length} stale sources (>${hours}h)`;
        } else if (opts.changed) {
          const allChanged = await listSourcesWithChanges();
          const sources = allChanged.filter((s) => s.type === "scrape" || s.type === "agent");
          const skipped = allChanged.length - sources.length;
          if (skipped > 0)
            logger.info(`Skipping ${skipped} feed/github source(s) (handled by cron)`);
          entries = sources.map((s) => ({ id: s.id, slug: s.slug }));
          label = `${entries.length} changed scrape/agent sources`;
        } else if (opts.retryErrors) {
          const sources = await listFetchableSources({ mode: "retry_errors" });
          entries = sources.map((s) => ({ id: s.id, slug: s.slug }));
          label = `${entries.length} errored sources`;
        } else {
          logger.error(
            "fetch requires a source slug or filter (--stale, --unfetched, --changed, --retry-errors, --org)",
          );
          process.exit(1);
        }

        if (entries.length === 0) {
          if (opts.json)
            await writeJsonLine({ sessionId: null, message: "No matching sources" });
          else logger.info("No matching sources to fetch.");
          return;
        }

        if (entries.length > 20) {
          logger.warn(
            `Capping at 20 sources (${entries.length} matched). Use multiple sessions for larger batches.`,
          );
          entries = entries.slice(0, 20);
        }

        try {
          const { slugs: activeSlugs, sessionMap } = await getActiveSources();
          const overlapping = entries.filter((e) => activeSlugs.includes(e.slug));
          if (overlapping.length > 0) {
            const overlapSessionId = sessionMap[overlapping[0].slug];
            const sourceList =
              overlapping.length <= 3
                ? overlapping.map((e) => e.slug).join(", ")
                : `${overlapping.length} sources`;
            console.error(
              chalk.red(
                `Source ${sourceList} already being fetched in session ${overlapSessionId.slice(0, 8)}.`,
              ),
            );
            process.exit(1);
          }
        } catch {
          if (!opts.json)
            logger.warn("Could not check for overlapping sessions — proceeding anyway.");
        }

        const sourceIdentifiers = entries.map((e) => e.id);

        let result: { sessionId: string };
        try {
          result = await apiFetch<{ sessionId: string }>("/v1/update", {
            method: "POST",
            body: JSON.stringify({
              company: label,
              sourceIdentifiers,
              orgId,
              correlationId: newCorrelationId(),
            }),
          });
        } catch (err) {
          logger.error(
            `Failed to start update session: ${err instanceof Error ? err.message : String(err)}`,
          );
          process.exit(1);
        }
        if (opts.json) {
          await writeJson(result);
        } else {
          logger.info(`Update session started: ${result.sessionId}`);
          logger.info(`Fetching ${sourceIdentifiers.length} source(s).`);
          logger.info(`Track progress: releases admin discovery task list`);
        }
      },
    );
}
