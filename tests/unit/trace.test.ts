import { describe, it, expect, afterEach, afterAll } from "bun:test";
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";
import type { Session } from "@buildinternet/releases-api-types";
import {
  resolveTraceDir,
  buildSessionSummaryMarkdown,
  buildBatchOverviewSummaryMarkdown,
  writeSessionTrace,
  trySaveSessionTrace,
} from "../../src/lib/trace.js";

// config caches the data dir lazily (first getDataDir() call, not at import),
// and resolveTraceDir's default branch is getRunsDir() — so a static import is
// safe as long as the env var is set before any helper runs, which it is.
const dataDir = mkdtempSync(join(tmpdir(), "rel-trace-data-"));
process.env.RELEASED_DATA_DIR = dataDir;

const baseSession: Session = {
  sessionId: "abc123-session-id",
  company: "Acme",
  type: "onboard",
  agent: "sonnet",
  status: "complete",
  startedAt: 1_000_000,
  lastUpdatedAt: 1_124_000, // +124s
  usage: {
    inputTokens: 12_345,
    outputTokens: 6_789,
    model: "claude-sonnet-4-6",
    estimatedUsd: 0.0123,
  },
  sourcesFound: 5,
  sourcesValidated: 4,
  releasesInserted: 12,
};

afterEach(() => {
  delete process.env.RELEASES_RUN_DIR;
});
afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe("resolveTraceDir", () => {
  it("prefers an explicit dir over everything", () => {
    process.env.RELEASES_RUN_DIR = "/run/dir";
    expect(resolveTraceDir("/explicit")).toBe("/explicit");
  });

  it("falls back to RELEASES_RUN_DIR when no explicit dir", () => {
    process.env.RELEASES_RUN_DIR = "/run/dir";
    expect(resolveTraceDir()).toBe("/run/dir");
  });

  it("falls back to getRunsDir() when neither is set", () => {
    delete process.env.RELEASES_RUN_DIR;
    expect(resolveTraceDir()).toBe(join(dataDir, "work", "runs"));
  });

  it("expands a tilde-prefixed dir", () => {
    expect(resolveTraceDir("~/runs")).toBe(join(homedir(), "runs"));
  });
});

describe("buildSessionSummaryMarkdown", () => {
  it("renders status, cost, and key session fields for a completed session", () => {
    const md = buildSessionSummaryMarkdown(baseSession);
    expect(md).toContain("**Status:** completed");
    expect(md).toContain("~$0.0123");
    expect(md).toContain("abc123-session-id");
    expect(md).toContain("Acme");
    expect(md).toContain("claude-sonnet-4-6");
  });

  it("maps an errored session to failed and surfaces the error", () => {
    const md = buildSessionSummaryMarkdown({
      ...baseSession,
      status: "error",
      error: "discovery blew up",
    });
    expect(md).toContain("**Status:** failed");
    expect(md).toContain("discovery blew up");
  });

  it("shows n/a cost when usage is absent", () => {
    const md = buildSessionSummaryMarkdown({ ...baseSession, usage: undefined });
    expect(md).toContain("**Status:** completed");
    expect(md).toContain("n/a");
  });
});

describe("buildBatchOverviewSummaryMarkdown", () => {
  it("maps a complete workflow to completed and includes the instance id", () => {
    const md = buildBatchOverviewSummaryMarkdown(
      { instanceId: "wf_1", status: "complete" },
      "wf_1",
    );
    expect(md).toContain("**Status:** completed");
    expect(md).toContain("wf_1");
  });

  it("maps errored/terminated to failed and surfaces the error", () => {
    const md = buildBatchOverviewSummaryMarkdown(
      { instanceId: "wf_2", status: "errored", error: "boom" },
      "wf_2",
    );
    expect(md).toContain("**Status:** failed");
    expect(md).toContain("boom");
  });
});

describe("writeSessionTrace", () => {
  it("writes <dir>/<sessionId>/{trace.json,summary.md} and returns the run subdir", () => {
    const runDir = mkdtempSync(join(tmpdir(), "rel-trace-run-"));
    try {
      const out = writeSessionTrace(baseSession, runDir);
      expect(out).toBe(join(runDir, baseSession.sessionId));
      expect(existsSync(join(out, "trace.json"))).toBe(true);
      expect(existsSync(join(out, "summary.md"))).toBe(true);

      const trace = JSON.parse(readFileSync(join(out, "trace.json"), "utf-8"));
      expect(trace.sessionId).toBe(baseSession.sessionId);
      expect(readFileSync(join(out, "summary.md"), "utf-8")).toContain("Acme");
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  it("honors RELEASES_RUN_DIR when no explicit dir is passed", () => {
    const runDir = mkdtempSync(join(tmpdir(), "rel-trace-env-"));
    process.env.RELEASES_RUN_DIR = runDir;
    try {
      const out = writeSessionTrace(baseSession);
      expect(out).toBe(join(runDir, baseSession.sessionId));
      expect(existsSync(join(out, "trace.json"))).toBe(true);
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
});

describe("trySaveSessionTrace", () => {
  it("returns the run subdir on success", () => {
    const runDir = mkdtempSync(join(tmpdir(), "rel-trace-try-"));
    try {
      expect(trySaveSessionTrace(baseSession, runDir)).toBe(join(runDir, baseSession.sessionId));
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });

  it("fails open (returns null, does not throw) when the dir cannot be written", () => {
    const runDir = mkdtempSync(join(tmpdir(), "rel-trace-fail-"));
    const asFile = join(runDir, "iam-a-file");
    writeFileSync(asFile, "x");
    try {
      // trace subdir would be <asFile>/<sessionId> — mkdir under a regular file throws.
      expect(() => trySaveSessionTrace(baseSession, asFile)).not.toThrow();
      expect(trySaveSessionTrace(baseSession, asFile)).toBeNull();
    } finally {
      rmSync(runDir, { recursive: true, force: true });
    }
  });
});
