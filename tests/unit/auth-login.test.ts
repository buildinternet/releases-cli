import { describe, it, expect } from "bun:test";
import { verifyToken, resolveTokenInput } from "../../src/cli/commands/auth.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("verifyToken", () => {
  it("returns the identity on 200", async () => {
    const fetchFn = (async () =>
      jsonResponse({ kind: "token", name: "laptop", scopes: ["read", "write"] })) as typeof fetch;
    const id = await verifyToken("relk_x_y", "https://api.releases.sh", fetchFn);
    expect(id.name).toBe("laptop");
    expect(id.scopes).toEqual(["read", "write"]);
  });

  it("throws on 401", async () => {
    const fetchFn = (async () => jsonResponse({ error: "unauthorized" }, 401)) as typeof fetch;
    await expect(verifyToken("relk_bad", "https://api.releases.sh", fetchFn)).rejects.toThrow(
      /rejected/i,
    );
  });

  it("throws on 500", async () => {
    const fetchFn = (async () => jsonResponse({}, 500)) as typeof fetch;
    await expect(verifyToken("relk_x_y", "https://api.releases.sh", fetchFn)).rejects.toThrow(
      /500/,
    );
  });
});

describe("resolveTokenInput", () => {
  it("returns a provided --token value (trimmed)", async () => {
    const reader = async () => "should-not-be-used";
    expect(await resolveTokenInput("  relk_a_b  ", reader)).toBe("relk_a_b");
  });

  it("uses the reader when no --token and a value comes back", async () => {
    const reader = async () => "  relk_from_prompt ";
    expect(await resolveTokenInput(undefined, reader)).toBe("relk_from_prompt");
  });

  it("throws when no --token and not a TTY (reader returns null)", async () => {
    const reader = async () => null;
    await expect(resolveTokenInput(undefined, reader)).rejects.toThrow(/No token/i);
  });
});
