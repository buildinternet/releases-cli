import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, spyOn } from "bun:test";
import { Command } from "commander";

// Drive the real client via env (a top-level mock.module leaks across files —
// see api-client.test.ts). RELEASES_API_KEY makes the CLI "authenticated" so
// the /v1/me follow guard and admin gate are satisfied.
const prevEnv: { url?: string; key?: string } = {};
beforeAll(() => {
  prevEnv.url = process.env.RELEASES_API_URL;
  prevEnv.key = process.env.RELEASES_API_KEY;
  process.env.RELEASES_API_URL = "https://test.example.com";
  process.env.RELEASES_API_KEY = "test-key";
});
afterAll(() => {
  if (prevEnv.url === undefined) delete process.env.RELEASES_API_URL;
  else process.env.RELEASES_API_URL = prevEnv.url;
  if (prevEnv.key === undefined) delete process.env.RELEASES_API_KEY;
  else process.env.RELEASES_API_KEY = prevEnv.key;
});

// Resolvers (findOrg/findSource/…) call process.exit(1) on a miss, which would
// silently kill the bun runner. Make it throw instead, so a mock that doesn't
// satisfy a resolver surfaces as a visible test failure.
let exitSpy: ReturnType<typeof spyOn>;
beforeEach(() => {
  exitSpy = spyOn(process, "exit").mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${code ?? 0})`);
  }) as never);
});
afterEach(() => {
  exitSpy.mockRestore();
});

const { markDryRun } = await import("../../src/lib/dry-run.js");
const { deleteSourceAction } = await import("../../src/cli/commands/delete.js");
const { registerFollowsCommands } = await import("../../src/cli/commands/follows.js");
const { registerKeysCommand } = await import("../../src/cli/commands/keys.js");
const { registerWebhookAdminCommand } = await import("../../src/cli/commands/admin/webhook.js");
const { registerOnboardApplyCommand } = await import("../../src/cli/commands/onboard-apply.js");

/** Run `fn`, capturing everything written to stdout; returns the captured text. */
async function captureStdout(fn: () => Promise<void>): Promise<string> {
  const original = process.stdout.write;
  let out = "";
  process.stdout.write = ((chunk: unknown) => {
    out += String(chunk);
    return true;
  }) as typeof process.stdout.write;
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return out;
}

describe("markDryRun", () => {
  it("adds dryRun: true additively, preserving existing fields", () => {
    expect(markDryRun({ status: "would-add", slug: "astro" })).toEqual({
      status: "would-add",
      slug: "astro",
      dryRun: true,
    });
  });

  it("forces dryRun: true even if the payload carried a different value", () => {
    // The spread puts the marker last, so it always wins.
    expect(markDryRun({ dryRun: false as unknown as never })).toEqual({ dryRun: true });
  });

  it("works on an object destined for an array element", () => {
    const rows = [{ slug: "a" }, { slug: "b" }].map(markDryRun);
    expect(rows.every((r) => r.dryRun === true)).toBe(true);
  });
});

describe("dry-run marker on an existing mutation (source delete)", () => {
  let originalFetch: typeof globalThis.fetch;
  let mutated: boolean;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mutated = false;
    const row = { id: "src_abc", slug: "acme", name: "Acme", url: "https://acme.dev/changelog" };
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "DELETE") mutated = true;
      // findSource("acme"): bare-slug → listSourcesBySlug (GET ?slug=, an array),
      // then hydrate the single match via GET /v1/sources/src_abc (one object).
      if (url.includes("slug=")) {
        return new Response(JSON.stringify([row]), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.includes("/v1/sources/src_abc")) {
        return new Response(JSON.stringify(row), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("null", { status: 404 });
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("stamps dryRun: true on each --json row and issues no DELETE", async () => {
    const out = await captureStdout(() =>
      deleteSourceAction(["acme"], { dryRun: true, json: true }),
    );
    const parsed = JSON.parse(out);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].dryRun).toBe(true);
    expect(parsed[0].status).toBe("would_remove"); // existing field preserved (not renamed)
    expect(mutated).toBe(false);
  });
});

/** Build a fresh program, register one command group, and parse user-style argv. */
function run(register: (p: Command) => void, argv: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride(); // throw instead of process.exit on parse trouble
  register(program);
  return program.parseAsync(argv, { from: "user" }) as unknown as Promise<void>;
}

describe("gap commands gain --dry-run (no mutating request fires)", () => {
  let originalFetch: typeof globalThis.fetch;
  let mutatingMethods: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mutatingMethods = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET") mutatingMethods.push(`${method} ${url}`);
      // follow/unfollow target resolution → an org row.
      if (url.includes("/v1/orgs")) {
        return new Response(JSON.stringify({ id: "org_1", slug: "acme", name: "Acme" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("null", { status: 404 });
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("follow --dry-run --json previews without POSTing", async () => {
    const out = await captureStdout(() =>
      run(registerFollowsCommands, ["follow", "acme", "--dry-run", "--json"]),
    );
    expect(JSON.parse(out).dryRun).toBe(true);
    expect(mutatingMethods).toHaveLength(0);
  });

  it("keys create --dry-run --json previews without POSTing", async () => {
    const out = await captureStdout(() =>
      run(registerKeysCommand, ["keys", "create", "--name", "ci", "--dry-run", "--json"]),
    );
    const parsed = JSON.parse(out);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.wouldCreate.scope).toBe("read");
    expect(mutatingMethods).toHaveLength(0);
  });

  it("admin webhook add --dry-run --json previews without POSTing", async () => {
    const out = await captureStdout(() =>
      run(registerWebhookAdminCommand, [
        "webhook",
        "add",
        "--org",
        "acme",
        "--url",
        "https://x/cb",
        "--dry-run",
        "--json",
      ]),
    );
    const parsed = JSON.parse(out);
    expect(parsed.dryRun).toBe(true);
    expect(parsed.wouldCreate.url).toBe("https://x/cb");
    expect(mutatingMethods).toHaveLength(0);
  });
});

describe("onboard apply --dry-run", () => {
  let originalFetch: typeof globalThis.fetch;
  let mutatingMethods: string[];

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    mutatingMethods = [];
    globalThis.fetch = (async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method !== "GET") mutatingMethods.push(`${method} ${url}`);
      if (url.includes("/v1/orgs")) {
        return new Response(JSON.stringify({ id: "org_1", slug: "acme", name: "Acme" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("null", { status: 404 });
    }) as unknown as typeof globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("previews per-source would-actions and writes nothing", async () => {
    const state = JSON.stringify({
      product: "acme",
      sources: [
        { slug: "a", url: "https://a.dev", type: "scrape", label: "A", approved: true },
        { slug: "b", url: "https://b.dev", type: "scrape", label: "B", approved: false },
        { slug: "c", url: "https://c.dev", type: "scrape", label: "C" },
      ],
    });
    // The command reads the state file from stdin when the path is "-".
    const originalStdin = Bun.stdin.text;
    (Bun.stdin as { text: () => Promise<string> }).text = async () => state;
    try {
      const out = await captureStdout(() =>
        run(registerOnboardApplyCommand, ["apply", "-", "--dry-run", "--json"]),
      );
      const parsed = JSON.parse(out) as Array<{ action: string; dryRun: boolean }>;
      expect(parsed.map((r) => r.action)).toEqual(["would-add", "would-ignore", "would-skip"]);
      expect(parsed.every((r) => r.dryRun === true)).toBe(true);
      expect(mutatingMethods).toHaveLength(0);
    } finally {
      (Bun.stdin as { text: () => Promise<string> }).text = originalStdin;
    }
  });
});
