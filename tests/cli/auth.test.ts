import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { mkdtempSync, rmSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { runCli } from "../utils.js";

let serverProc: ChildProcess | null = null;
let baseUrl = "";
let dataDir = "";

const PORT = 19877;

beforeAll(async () => {
  dataDir = mkdtempSync(join(tmpdir(), "rel-authcli-"));

  // Spawn the stub server as a detached child process so spawned CLI
  // subprocesses can reach it (Bun.serve in-process is network-sandboxed
  // in some environments, but a detached OS process is always reachable).
  const serverScript = `
const server = Bun.serve({
  port: ${PORT},
  hostname: "0.0.0.0",
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/v1/tokens/me") {
      const auth = req.headers.get("authorization") ?? "";
      if (auth !== "Bearer relk_good_token") return new Response("{}", { status: 401 });
      return Response.json({ kind: "token", name: "laptop", scopes: ["read", "write"] });
    }
    return Response.json({ sources: [] });
  },
});
process.stdout.write("READY\\n");
await Bun.sleep(60000);
`;
  const scriptPath = join(dataDir, "stub-server.ts");
  writeFileSync(scriptPath, serverScript);

  serverProc = spawn("bun", [scriptPath], {
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });

  baseUrl = `http://localhost:${PORT}`;

  // Wait until the server is ready.
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("stub server start timeout")), 5000);
    serverProc!.stdout!.on("data", (d: Buffer) => {
      if (d.toString().includes("READY")) {
        clearTimeout(timer);
        resolve();
      }
    });
    serverProc!.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
});

afterAll(() => {
  if (serverProc) {
    serverProc.kill();
    serverProc = null;
  }
  rmSync(dataDir, { recursive: true, force: true });
});

const env = () => ({
  RELEASED_API_KEY: "",
  RELEASED_API_URL: baseUrl,
  RELEASED_DATA_DIR: dataDir,
  RELEASED_TELEMETRY_DISABLED: "1",
});

describe("releases auth (e2e)", () => {
  it("login --token verifies and stores the credential", () => {
    const r = runCli(["auth", "login", "--token", "relk_good_token"], { env: env() });
    expect(r.exitCode).toBe(0);
    expect(r.stdout + r.stderr).toMatch(/Verified/);
    expect(existsSync(join(dataDir, "credentials"))).toBe(true);
  });

  it("token prints the stored token", () => {
    const r = runCli(["auth", "token"], { env: env() });
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe("relk_good_token");
  });

  it("status --json reports authenticated + file source", () => {
    const r = runCli(["auth", "status", "--json"], { env: env() });
    const body = JSON.parse(r.stdout) as {
      authenticated: boolean;
      source: string;
      scopes: string[];
    };
    expect(body.authenticated).toBe(true);
    expect(body.source).toBe("file");
    expect(body.scopes).toEqual(["read", "write"]);
  });

  it("login rejects a bad token without saving", () => {
    const bad = mkdtempSync(join(tmpdir(), "rel-authbad-"));
    const r = runCli(["auth", "login", "--token", "relk_bad"], {
      env: {
        RELEASED_API_KEY: "",
        RELEASED_API_URL: baseUrl,
        RELEASED_DATA_DIR: bad,
        RELEASED_TELEMETRY_DISABLED: "1",
      },
    });
    expect(r.exitCode).toBe(1);
    expect(existsSync(join(bad, "credentials"))).toBe(false);
    rmSync(bad, { recursive: true, force: true });
  });

  it("an admin command is allowed with a stored write-capable token", () => {
    const r = runCli(["admin", "source", "list"], { env: env() });
    // Not blocked by the admin-key gate (stored token present).
    expect(r.stderr).not.toMatch(/requires an API key/);
  });

  it("logout removes the stored token", () => {
    const r = runCli(["auth", "logout"], { env: env() });
    expect(r.exitCode).toBe(0);
    expect(existsSync(join(dataDir, "credentials"))).toBe(false);
  });
});
