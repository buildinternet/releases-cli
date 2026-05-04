import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import {
  findSource,
  getSourcesByOrg,
  findOrg,
  listOrgs,
  getLatestReleases,
  unifiedSearch,
  sourceChangelog,
  getAliases,
  getTagsForOrg,
  getOrgAccountsBySlug,
  getProductsByOrg,
  findProduct,
  listSourcesWithOrg,
} from "../api/client.js";
import { logger } from "@releases/lib/logger";
import { recordEvent } from "../lib/telemetry.js";
import { VERSION } from "../cli/version.js";

function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

const server = new McpServer({
  name: "releases",
  version: VERSION,
});

// Wrap every tool handler with fire-and-forget telemetry.
{
  const original = server.registerTool.bind(server);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (server as any).registerTool = (
    name: string,
    config: unknown,
    handler: (...args: unknown[]) => unknown,
  ) => {
    const wrapped = async (...args: unknown[]) => {
      const start = Date.now();
      let exitCode = 0;
      try {
        return await handler(...args);
      } catch (err) {
        exitCode = 1;
        throw err;
      } finally {
        void recordEvent({
          surface: "mcp",
          command: `tool ${name}`,
          exitCode,
          durationMs: Date.now() - start,
        });
      }
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return original(name as any, config as any, wrapped as any);
  };
}

// ── search_releases ──────────────────────────────────────────────────
server.registerTool(
  "search_releases",
  {
    description:
      "Search indexed release notes. Proxies to api.releases.sh — supports hybrid lexical + semantic search.",
    inputSchema: {
      query: z.string().describe("Search query"),
      organization: z
        .string()
        .optional()
        .describe("Filter to sources belonging to this organization"),
      type: z
        .enum(["feature", "rollup"])
        .optional()
        .describe(
          "Filter by release type: 'feature' for individual releases, 'rollup' for seasonal/quarterly catch-all posts. Omit to include both.",
        ),
      limit: z.number().optional().describe("Max results to return (default 20)"),
      mode: z
        .enum(["lexical", "semantic", "hybrid"])
        .optional()
        .describe("Retrieval strategy (default: hybrid)."),
    },
  },
  async ({ query, organization, limit, mode }) => {
    const maxResults = limit ?? 20;

    const searchResult = await unifiedSearch(query, maxResults, {
      org: organization,
      mode: mode ?? "hybrid",
    });

    let results = searchResult.releases ?? [];
    // type filter: SearchReleaseHit doesn't expose a type field in this API shape.
    // The remote MCP worker at mcp.releases.sh handles type filtering natively.

    results = results.slice(0, maxResults);

    if (results.length === 0) {
      return textResult("No releases found matching the query.");
    }

    const text = results
      .map((r) => {
        const preview = (r.summary || r.content || "").slice(0, 300);
        return `**${r.title}**\n${preview}`;
      })
      .join("\n\n---\n\n");

    return textResult(text);
  },
);

// ── get_latest_releases ──────────────────────────────────────────────
server.registerTool(
  "get_latest_releases",
  {
    description: "Get the most recent releases, optionally filtered by product or organization",
    inputSchema: {
      product: z.string().optional().describe("Filter to a specific product slug"),
      organization: z
        .string()
        .optional()
        .describe("Filter to sources belonging to this organization"),
      type: z
        .enum(["feature", "rollup"])
        .optional()
        .describe(
          "Filter by release type: 'feature' for individual releases, 'rollup' for seasonal/quarterly catch-all posts. Omit to include both.",
        ),
      count: z.number().optional().describe("Number of releases to return (default 10)"),
    },
  },
  async ({ product, organization, count }) => {
    const maxCount = count ?? 10;

    let releases = await getLatestReleases({
      source: product,
      org: organization,
      count: maxCount,
    });

    // type filter: LatestRelease doesn't carry a type field — the remote MCP worker
    // handles this natively. Silently ignored when proxying.

    releases = releases.slice(0, maxCount);

    if (releases.length === 0) {
      return textResult("No releases found.");
    }

    const text = releases
      .map((r) => {
        const preview = (r.contentSummary || "").slice(0, 500);
        return [
          `**${r.title}**`,
          `Source: ${r.sourceName} | Version: ${r.version ?? "N/A"} | Date: ${r.publishedAt ?? "N/A"}`,
          preview,
        ].join("\n");
      })
      .join("\n\n---\n\n");

    return textResult(text);
  },
);

// ── list_sources ─────────────────────────────────────────────────────
server.registerTool(
  "list_sources",
  {
    description: "List all indexed changelog sources",
    inputSchema: {
      organization: z
        .string()
        .optional()
        .describe("Filter to sources belonging to this organization"),
    },
  },
  async ({ organization }) => {
    let allSources;

    if (organization) {
      const org = await findOrg(organization);
      if (!org) {
        return textResult(`No organization found matching "${organization}"`);
      }
      allSources = await getSourcesByOrg(org.id);
    } else {
      allSources = await listSourcesWithOrg();
    }

    if (allSources.length === 0) {
      return textResult("No products indexed yet.");
    }

    const text = allSources
      .map((s) =>
        [
          `**${s.name}**`,
          `  Slug: ${s.slug}`,
          `  Type: ${s.type}`,
          `  URL: ${s.url}`,
          `  Last fetched: ${s.lastFetchedAt ?? "Never"}`,
        ].join("\n"),
      )
      .join("\n\n");

    return textResult(text);
  },
);

// ── get_source ───────────────────────────────────────────────────────
server.registerTool(
  "get_source",
  {
    description: "Get detailed information about a single changelog source",
    inputSchema: {
      identifier: z.string().describe("Source slug or ID"),
    },
  },
  async ({ identifier }) => {
    const source = await findSource(identifier);
    if (!source) {
      return textResult(`No source found matching "${identifier}"`);
    }

    const lines: string[] = [
      `**Source: ${source.name}**`,
      `Slug: ${source.slug} | Type: ${source.type}`,
      `URL: ${source.url}`,
      `Last fetched: ${source.lastFetchedAt ?? "Never"}`,
    ];

    return textResult(lines.join("\n"));
  },
);

// ── get_source_changelog ─────────────────────────────────────────────
server.registerTool(
  "get_source_changelog",
  {
    description:
      "Read a tracked CHANGELOG file for a GitHub source. Supports heading-aligned slicing by chars (`limit`) or tokens (`tokens`, cl100k_base). Chain successive calls via `nextOffset` to page through large files.",
    inputSchema: {
      source: z.string().describe("Source slug or ID (e.g. 'apollo-client' or 'src_...')"),
      path: z
        .string()
        .optional()
        .describe(
          "Specific file path to read (e.g. 'packages/next/CHANGELOG.md'). Defaults to the root CHANGELOG.",
        ),
      offset: z
        .number()
        .optional()
        .describe(
          "Character offset into the selected file. Snapped forward to the next heading unless 0.",
        ),
      limit: z
        .number()
        .optional()
        .describe(
          "Target slice size in characters. Defaults to 40000 when slicing without a token budget.",
        ),
      tokens: z
        .number()
        .optional()
        .describe(
          "Target slice size in tokens (cl100k_base). Takes precedence over `limit`. Recommended brackets: 2000, 5000, 10000, 20000.",
        ),
    },
  },
  async ({ source: identifier, path: requestedPath, offset, limit, tokens }) => {
    const response = await sourceChangelog(identifier, {
      path: requestedPath,
      offset,
      limit,
      tokens,
    });

    if (!response) {
      return textResult(
        `No CHANGELOG file is tracked for "${identifier}". Only GitHub sources expose this.`,
      );
    }

    const lines: string[] = [
      `**${response.path}**`,
      `Source: ${response.url ?? ""}`,
      `Offset: ${response.offset} | Total chars: ${response.totalChars} | Total tokens: ${response.totalTokens ?? "N/A"}`,
    ];

    if (response.truncated) {
      lines.push(`WARNING: File truncated at 1MB cap.`);
    }

    if (response.nextOffset != null && response.nextOffset < response.totalChars) {
      lines.push(`Next offset: ${response.nextOffset} (pass as offset to continue)`);
    }

    lines.push("");
    lines.push(response.content);

    return textResult(lines.join("\n"));
  },
);

// ── list_organizations ───────────────────────────────────────────────
server.registerTool(
  "list_organizations",
  {
    description: "List all indexed organizations, optionally filtered",
    inputSchema: {
      query: z
        .string()
        .optional()
        .describe("Search across org name, slug, domain, and account handles"),
      platform: z.string().optional().describe("Filter to orgs with an account on this platform"),
    },
  },
  async ({ query, platform }) => {
    // /v1/orgs is paginated server-side post-#723; page through every result so
    // the tool truly lists all indexed organizations, not just the first page.
    const allOrgs: Awaited<ReturnType<typeof listOrgs>>["items"] = [];
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      // eslint-disable-next-line no-await-in-loop
      const result = await listOrgs({ query, platform, page, limit: 200 });
      allOrgs.push(...result.items);
      hasMore = result.pagination.hasMore;
      page += 1;
    }

    if (allOrgs.length === 0) {
      return textResult("No organizations found.");
    }

    const text = allOrgs
      .map((o) =>
        [`**${o.name}**`, `  Slug: ${o.slug}`, `  Domain: ${o.domain ?? "N/A"}`].join("\n"),
      )
      .join("\n\n");

    return textResult(text);
  },
);

// ── get_organization ─────────────────────────────────────────────────
server.registerTool(
  "get_organization",
  {
    description:
      "Get detailed information about a single organization including accounts, tags, sources, products, and aliases",
    inputSchema: {
      identifier: z.string().describe("Organization slug, domain, name, or account handle"),
    },
  },
  async ({ identifier }) => {
    const org = await findOrg(identifier);
    if (!org) {
      return textResult(`No organization found matching "${identifier}"`);
    }

    const [accounts, tagRows, orgSources, orgProducts, aliases] = await Promise.all([
      getOrgAccountsBySlug(org.slug),
      getTagsForOrg(org.id),
      getSourcesByOrg(org.id),
      getProductsByOrg(org.id),
      getAliases("org", org.slug),
    ]);

    const lines: string[] = [];
    lines.push(`**Organization: ${org.name}**`);
    lines.push(
      `Slug: ${org.slug} | Domain: ${org.domain ?? "N/A"} | Category: ${org.category ?? "N/A"}`,
    );
    if (org.description) lines.push(`Description: ${org.description}`);
    lines.push("");
    lines.push(
      accounts.length > 0
        ? `Accounts: ${accounts.map((a) => `${a.platform}/${a.handle}`).join(", ")}`
        : "Accounts: none",
    );
    lines.push(tagRows.length > 0 ? `Tags: ${tagRows.join(", ")}` : "Tags: none");
    lines.push(aliases.length > 0 ? `Aliases: ${aliases.join(", ")}` : "Aliases: none");

    if (orgProducts.length > 0) {
      lines.push("");
      lines.push("Products:");
      for (const p of orgProducts) {
        const urlPart = p.url ? ` — ${p.url}` : "";
        const descPart = p.description ? ` — ${p.description}` : "";
        lines.push(`- ${p.name} (${p.slug})${urlPart}${descPart}`);
      }
    }

    if (orgSources.length > 0) {
      lines.push("");
      lines.push("Sources:");
      for (const s of orgSources) {
        lines.push(`- **${s.name}** (${s.slug})`);
        lines.push(`  Type: ${s.type} | URL: ${s.url}`);
        lines.push(`  Last fetched: ${s.lastFetchedAt ?? "Never"}`);
      }
    } else {
      lines.push("");
      lines.push("Sources: none");
    }

    return textResult(lines.join("\n"));
  },
);

// ── list_products ─────────────────────────────────────────────────────
server.registerTool(
  "list_products",
  {
    description: "List products, optionally scoped to one organization",
    inputSchema: {
      organization: z.string().optional().describe("Organization slug to filter by"),
    },
  },
  async ({ organization }) => {
    if (!organization) {
      return textResult("Please provide an organization slug to list products.");
    }

    const org = await findOrg(organization);
    if (!org) {
      return textResult(`No organization found matching "${organization}"`);
    }

    const products = await getProductsByOrg(org.id);

    if (products.length === 0) {
      return textResult(`No products found for ${org.name}.`);
    }

    const text = products
      .map((p) =>
        [
          `**${p.name}** (${p.slug})`,
          p.description ? `  ${p.description}` : null,
          `  Category: ${p.category ?? "N/A"} | Sources: ${p.sourceCount ?? 0}`,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");

    return textResult(text);
  },
);

// ── get_product ───────────────────────────────────────────────────────
server.registerTool(
  "get_product",
  {
    description: "Get detailed information about a single product",
    inputSchema: {
      identifier: z.string().describe("Product slug or ID"),
    },
  },
  async ({ identifier }) => {
    const product = await findProduct(identifier);
    if (!product) {
      return textResult(`No product found matching "${identifier}"`);
    }

    const lines: string[] = [
      `**Product: ${product.name}**`,
      `Slug: ${product.slug} | Category: ${product.category ?? "N/A"}`,
    ];
    if (product.description) lines.push(`Description: ${product.description}`);
    if (product.url) lines.push(`URL: ${product.url}`);

    return textResult(lines.join("\n"));
  },
);

// ── Start function ───────────────────────────────────────────────────
export async function startMcpServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info("MCP server started on stdio");
}
