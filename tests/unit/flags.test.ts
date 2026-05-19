import { describe, it, expect, spyOn } from "bun:test";
import { parsePositiveIntFlag, parseNonNegIntFlag } from "../../src/lib/flags.js";

// Intercept process.exit so invalid-input tests don't kill the runner.
function withExitTrap(fn: () => void): void {
  const spy = spyOn(process, "exit").mockImplementation(() => {
    throw new Error("process.exit called");
  });
  try {
    fn();
  } finally {
    spy.mockRestore();
  }
}

describe("parsePositiveIntFlag", () => {
  it("returns undefined when the flag is not supplied", () => {
    expect(parsePositiveIntFlag("limit", undefined)).toBeUndefined();
  });

  it("accepts a plain positive integer string", () => {
    expect(parsePositiveIntFlag("limit", "1")).toBe(1);
    expect(parsePositiveIntFlag("limit", "100")).toBe(100);
  });

  it("rejects a decimal string (1.5 must not silently become 1)", () => {
    withExitTrap(() => {
      expect(() => parsePositiveIntFlag("limit", "1.5")).toThrow("process.exit called");
    });
  });

  it("rejects a string with trailing non-digit chars (10abc must not become 10)", () => {
    withExitTrap(() => {
      expect(() => parsePositiveIntFlag("limit", "10abc")).toThrow("process.exit called");
    });
  });

  it("rejects zero", () => {
    withExitTrap(() => {
      expect(() => parsePositiveIntFlag("limit", "0")).toThrow("process.exit called");
    });
  });

  it("rejects a negative integer", () => {
    withExitTrap(() => {
      expect(() => parsePositiveIntFlag("limit", "-1")).toThrow("process.exit called");
    });
  });

  it("rejects a non-numeric string", () => {
    withExitTrap(() => {
      expect(() => parsePositiveIntFlag("limit", "abc")).toThrow("process.exit called");
    });
  });
});

describe("parseNonNegIntFlag", () => {
  it("returns undefined when the flag is not supplied", () => {
    expect(parseNonNegIntFlag("offset", undefined)).toBeUndefined();
  });

  it("accepts zero", () => {
    expect(parseNonNegIntFlag("offset", "0")).toBe(0);
  });

  it("accepts a plain positive integer string", () => {
    expect(parseNonNegIntFlag("offset", "42")).toBe(42);
  });

  it("rejects a decimal string (1.5 must not silently become 1)", () => {
    withExitTrap(() => {
      expect(() => parseNonNegIntFlag("offset", "1.5")).toThrow("process.exit called");
    });
  });

  it("rejects a string with trailing non-digit chars (10abc must not become 10)", () => {
    withExitTrap(() => {
      expect(() => parseNonNegIntFlag("offset", "10abc")).toThrow("process.exit called");
    });
  });

  it("rejects a negative integer", () => {
    withExitTrap(() => {
      expect(() => parseNonNegIntFlag("offset", "-1")).toThrow("process.exit called");
    });
  });
});
