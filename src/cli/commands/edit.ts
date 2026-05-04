import { Command } from "commander";
import { warnDeprecatedAlias } from "../../lib/deprecated-alias.js";
import { updateSourceAction, type UpdateSourceOpts } from "./update.js";

/**
 * Registers the deprecated `edit` alias alongside the canonical `update`
 * command. Both share the same action — the alias path emits a deprecation
 * warning first.
 *
 * @deprecated Use `registerUpdateCommand` instead.
 */
export function registerEditCommand(program: Command) {
  program
    .command("edit")
    .description("(deprecated — use update) Edit an existing changelog source")
    .argument("<identifier>", "Source ID (src_...) or slug")
    .option("--name <name>", "Update display name")
    .option("--url <url>", "Update source URL")
    .option("--type <type>", "Update source type (github, scrape, feed, agent)")
    .option("--slug <newSlug>", "Update slug (requires --confirm-slug-change; breaks web links)")
    .option("--confirm-slug-change", "Confirm slug rename")
    .option("--org <org>", "Set organization")
    .option("--no-org", "Remove organization association")
    .option("--product <product>", "Set product (slug)")
    .option("--no-product", "Remove product association")
    .option("--feed-url <feedUrl>", "Set or update the feed URL")
    .option("--no-feed-url", "Remove stored feed URL")
    .option("--markdown-url <markdownUrl>", "Set the raw markdown URL for this source")
    .option("--parse-instructions <text>", "Set AI parsing instructions for this source")
    .option("--no-parse-instructions", "Remove AI parsing instructions")
    .option("--render", "Force headless browser rendering for this source")
    .option("--no-render", "Allow fast fetch without headless browser rendering")
    .option("--provider <provider>", "Set the detected provider")
    .option("--fetch-method <fetchMethod>", "Set the recommended fetch method")
    .option("--primary", "Mark as the org's primary changelog source")
    .option("--no-primary", "Unmark as primary")
    .option("--priority <level>", "Set fetch priority (normal, low, paused)")
    .option("--disable", "Disable source")
    .option("--enable", "Re-enable a disabled source")
    .option("--json", "Output as JSON")
    .action(warnDeprecatedAlias<[string, UpdateSourceOpts]>("edit", "update", updateSourceAction));
}
