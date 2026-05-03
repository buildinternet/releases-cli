import { describe, it, expect } from "bun:test";
import { promptConfirm } from "../../src/lib/confirm.js";

describe("promptConfirm", () => {
  it("returns true when the typed slug matches the expected value", async () => {
    const reader = async () => "vercel";
    expect(await promptConfirm("Type the org slug to confirm: ", "vercel", reader)).toBe(true);
  });

  it("trims trailing whitespace before comparing (newline tolerated)", async () => {
    const reader = async () => "vercel\n";
    expect(await promptConfirm("Type the org slug to confirm: ", "vercel", reader)).toBe(true);
  });

  it("returns false when the typed slug does not match", async () => {
    const reader = async () => "wrong-slug";
    expect(await promptConfirm("Type the org slug to confirm: ", "vercel", reader)).toBe(false);
  });

  it("returns false when the reader returns null (no TTY available)", async () => {
    const reader = async () => null;
    expect(await promptConfirm("Type the org slug to confirm: ", "vercel", reader)).toBe(false);
  });

  it("treats an empty answer as a mismatch", async () => {
    const reader = async () => "";
    expect(await promptConfirm("Type the org slug to confirm: ", "vercel", reader)).toBe(false);
  });
});
