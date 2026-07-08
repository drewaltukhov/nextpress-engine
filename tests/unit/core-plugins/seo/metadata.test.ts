import { describe, it, expect } from "vitest";
import {
  breadcrumbJsonLd,
  wrapJsonLdGraph,
  webSiteJsonLd,
  articleJsonLd
} from "@core-plugins/seo/metadata";

describe("breadcrumbJsonLd", () => {
  it("generates a BreadcrumbList with positions", () => {
    const result = breadcrumbJsonLd([
      { name: "Home", url: "https://example.com" },
      { name: "Blog", url: "https://example.com/blog" },
      { name: "Post", url: "https://example.com/blog/post" }
    ]) as Record<string, unknown>;

    expect(result["@type"]).toBe("BreadcrumbList");
    const items = result.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(3);
    expect(items[0]?.position).toBe(1);
    expect(items[2]?.position).toBe(3);
    expect(items[1]?.name).toBe("Blog");
  });
});

describe("wrapJsonLdGraph", () => {
  it("wraps nodes in schema.org @graph", () => {
    const graph = wrapJsonLdGraph([{ "@type": "WebSite" }]) as Record<string, unknown>;
    expect(graph["@context"]).toBe("https://schema.org");
    expect(graph["@graph"]).toHaveLength(1);
  });
});

describe("webSiteJsonLd", () => {
  it("produces a WebSite node", () => {
    const node = webSiteJsonLd({ name: "My Site", url: "https://example.com" }) as Record<string, unknown>;
    expect(node["@type"]).toBe("WebSite");
    expect(node.name).toBe("My Site");
    expect(node.url).toBe("https://example.com");
  });
});

describe("articleJsonLd", () => {
  it("produces an Article node with required fields", () => {
    const node = articleJsonLd({
      headline: "Hello",
      url: "https://example.com/hello",
      datePublished: "2026-05-01T12:00:00Z"
    }) as Record<string, unknown>;
    expect(node["@type"]).toBe("Article");
    expect(node.headline).toBe("Hello");
  });

  it("includes optional author", () => {
    const node = articleJsonLd({
      headline: "Test",
      url: "https://example.com/test",
      datePublished: "2026-05-01T12:00:00Z",
      author: { name: "Alice", url: "https://example.com/alice" }
    }) as Record<string, unknown>;
    const author = node.author as Record<string, unknown>;
    expect(author["@type"]).toBe("Person");
    expect(author.name).toBe("Alice");
  });
});
