import { describe, it, expect } from "vitest";
import { normalizeSlug, stripTrailingSlash } from "@core/slugs/normalize";

describe("normalizeSlug", () => {
  it("lowercases", () => {
    expect(normalizeSlug("HelloWorld")).toBe("helloworld");
  });

  it("converts whitespace to dashes", () => {
    expect(normalizeSlug("hello world  again")).toBe("hello-world-again");
  });

  it("collapses repeated dashes", () => {
    expect(normalizeSlug("hello---world")).toBe("hello-world");
  });

  it("strips leading/trailing dashes", () => {
    expect(normalizeSlug("--hello-world--")).toBe("hello-world");
  });

  it("transliterates common diacritics", () => {
    expect(normalizeSlug("über")).toBe("uber");
    expect(normalizeSlug("café")).toBe("cafe");
    expect(normalizeSlug("naïve")).toBe("naive");
  });

  it("removes characters that cannot be ASCII-folded", () => {
    expect(normalizeSlug("hello 你好 world")).toBe("hello-world");
  });
});

describe("stripTrailingSlash", () => {
  it("removes a single trailing slash", () => {
    expect(stripTrailingSlash("/foo/")).toBe("/foo");
  });

  it("leaves the root '/' as-is", () => {
    expect(stripTrailingSlash("/")).toBe("/");
  });

  it("leaves paths without a trailing slash unchanged", () => {
    expect(stripTrailingSlash("/foo/bar")).toBe("/foo/bar");
  });
});
