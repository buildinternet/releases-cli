import { describe, it, expect } from "bun:test";
import { unescapeHtmlEntities } from "../../src/cli/commands/admin/overview/unescape-html.js";

describe("unescapeHtmlEntities", () => {
  it("decodes &amp;", () => {
    expect(unescapeHtmlEntities("foo &amp; bar")).toBe("foo & bar");
  });

  it("decodes &lt;", () => {
    expect(unescapeHtmlEntities("a &lt; b")).toBe("a < b");
  });

  it("decodes &gt;", () => {
    expect(unescapeHtmlEntities("a &gt; b")).toBe("a > b");
  });

  it("decodes &quot;", () => {
    expect(unescapeHtmlEntities("say &quot;hello&quot;")).toBe('say "hello"');
  });

  it("decodes &#39;", () => {
    expect(unescapeHtmlEntities("it&#39;s")).toBe("it's");
  });

  it("decodes mixed entities in one pass", () => {
    expect(unescapeHtmlEntities("(string &amp; {}) &lt;T&gt;")).toBe("(string & {}) <T>");
  });

  it("&amp;lt; decodes to &lt;, not < (single-pass: amp → & leaving literal &lt;)", () => {
    // Single-pass regex: &amp; → & in one match, leaving &lt; untouched in that same pass.
    expect(unescapeHtmlEntities("&amp;lt;")).toBe("&lt;");
  });

  it("is idempotent on already-decoded strings", () => {
    expect(unescapeHtmlEntities("foo & bar")).toBe("foo & bar");
  });

  it("leaves unrelated text unchanged", () => {
    expect(unescapeHtmlEntities("hello world")).toBe("hello world");
  });
});
