import { describe, it, expect } from "bun:test";
import { runCli } from "../utils.js";

/**
 * Integration coverage for `releases json validate` (releases-cli#351) — the
 * owner-facing validator for the releases.json v2 manifest. Every path here is
 * local (schema parse or stdin), so no network or credential is touched. The
 * domain form is deferred until the public dry-run endpoint lands
 * (buildinternet/releases#1910); we assert it exits cleanly with guidance.
 */

const VALID_DOMAIN = JSON.stringify({
  $schema: "https://releases.sh/schemas/releases.json",
  version: 2,
  name: "Acme Inc",
  category: "developer-tools",
  products: [
    {
      name: "Acme API",
      slug: "acme-api",
      releases: [{ url: "https://acme.com/changelog", canonical: true }],
    },
  ],
  registries: { "releases.sh": { org: "org_abc123", verification: "dns-txt-token" } },
});

const INVALID = JSON.stringify({
  version: 3,
  name: "Broken",
  releases: [{ url: "http://insecure.com/feed" }, { title: "no locator" }],
});

describe("json validate (public CLI integration)", () => {
  it("documents the command and its flags in help", () => {
    const { stdout, exitCode } = runCli(["json", "validate", "--help"]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("<target>");
    expect(stdout).toContain("--json");
    expect(stdout).toContain("releases.sh/docs/listing");
  });

  it("validates a repo-scope manifest from stdin", () => {
    const repoManifest = JSON.stringify({
      $schema: "https://releases.sh/schemas/releases.json",
      version: 2,
      product: { name: "CLI", slug: "cli" },
      releases: [{ github: "self" }],
    });
    const { stdout, exitCode } = runCli(["json", "validate", "-"], { input: repoManifest });
    expect(exitCode).toBe(0);
    expect(stdout).toContain("valid releases.json");
    expect(stdout).toContain("repo scope");
    expect(stdout).toContain("cli");
  });

  it("validates a domain-scope manifest and reports --json summary", () => {
    const { stdout, exitCode } = runCli(["json", "validate", "-", "--json"], {
      input: VALID_DOMAIN,
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout) as {
      valid: boolean;
      scope: string;
      summary: { scope: string; products: number; releaseLocations: number };
    };
    expect(parsed.valid).toBe(true);
    expect(parsed.scope).toBe("domain");
    expect(parsed.summary.products).toBe(1);
    expect(parsed.summary.releaseLocations).toBe(1);
  });

  it("reports schema violations with paths and exits non-zero (--json)", () => {
    const { stdout, exitCode } = runCli(["json", "validate", "-", "--json"], { input: INVALID });
    expect(exitCode).toBe(1);
    const parsed = JSON.parse(stdout) as {
      valid: boolean;
      scope: string;
      issues: { path: string; message: string }[];
    };
    expect(parsed.valid).toBe(false);
    expect(parsed.scope).toBe("domain");
    const paths = parsed.issues.map((i) => i.path);
    expect(paths).toContain("version");
    expect(paths).toContain("releases.0.url");
    expect(paths).toContain("releases.1");
  });

  it("rejects non-JSON input before schema validation", () => {
    const { stderr, exitCode } = runCli(["json", "validate", "-"], { input: "{ not json" });
    expect(exitCode).toBe(1);
    expect(stderr.toLowerCase()).toContain("not valid json");
  });

  it("defers the domain form to the pending dry-run endpoint", () => {
    const { stdout, stderr, exitCode } = runCli(["json", "validate", "acme.com"]);
    expect(exitCode).toBe(2);
    expect((stdout + stderr).toLowerCase()).toContain("domain validation isn't available yet");
    expect(stdout + stderr).toContain("1910");
  });
});
