import { describe, it, expect } from "vitest";
import {
  generateSitemap,
  generateRobotsTxt,
  generateRssFeed,
  AI_CRAWLER_USER_AGENTS
} from "@core-plugins/seo/generators";

describe("generateSitemap", () => {
  it("produces valid XML with urlset root", () => {
    const xml = generateSitemap([]);
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain("<urlset");
    expect(xml).toContain("</urlset>");
  });

  it("emits one <url> per entry with loc + lastmod", () => {
    const xml = generateSitemap([
      { loc: "https://example.com", lastmod: "2026-05-06T00:00:00.000Z", priority: 1.0 },
      { loc: "https://example.com/about", lastmod: "2026-05-01T00:00:00.000Z" }
    ]);
    expect(xml).toContain("<loc>https://example.com</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<lastmod>2026-05-06T00:00:00.000Z</lastmod>");
    expect(xml).toContain("<priority>1.0</priority>");
  });

  it("escapes XML-special characters in loc", () => {
    const xml = generateSitemap([{ loc: "https://example.com/?q=a&b=1" }]);
    expect(xml).toContain("https://example.com/?q=a&amp;b=1");
    expect(xml).not.toContain("?q=a&b=1");
  });
});

describe("generateRobotsTxt", () => {
  it("blocks all crawling on staging", () => {
    const txt = generateRobotsTxt({ siteUrl: "https://staging.example.com", isStaging: true });
    expect(txt).toContain("Disallow: /");
    expect(txt).toContain("Staging environment");
  });

  it("allows crawling on production", () => {
    const txt = generateRobotsTxt({ siteUrl: "https://example.com", isStaging: false });
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Disallow: /admin/");
    expect(txt).toContain("Disallow: /api/");
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("emits a search-only Content-Signal by default, without granting AI use", () => {
    const txt = generateRobotsTxt({ siteUrl: "https://example.com" });
    expect(txt).toContain("Content-Signal: search=yes");
    // Silence, not consent: no explicit ai-train/ai-input grant by default.
    expect(txt).not.toContain("ai-train=yes");
    expect(txt).not.toContain("ai-input=yes");
  });

  it("emits AI opt-out Content-Signals when AI agents are discouraged", () => {
    const txt = generateRobotsTxt({ siteUrl: "https://example.com", discourageAiAgents: true });
    expect(txt).toContain("Content-Signal: search=yes, ai-input=no, ai-train=no");
  });

  it("emits an all-no Content-Signal when indexing is discouraged", () => {
    const txt = generateRobotsTxt({ siteUrl: "https://example.com", discourageIndexing: true });
    expect(txt).toContain("Content-Signal: search=no, ai-input=no, ai-train=no");
  });

  it("uses custom content when provided", () => {
    const custom = "User-agent: *\nDisallow: /secret/";
    const txt = generateRobotsTxt({ siteUrl: "https://example.com", customContent: custom });
    expect(txt).toBe(custom);
  });

  it("prepends a Disallow stanza for every named AI bot when AI agents are discouraged", () => {
    const txt = generateRobotsTxt({ siteUrl: "https://example.com", discourageAiAgents: true });
    for (const ua of AI_CRAWLER_USER_AGENTS) {
      expect(txt).toContain(`User-agent: ${ua}`);
    }
    expect(txt).toContain("# AI crawler access is disabled in site settings.");
    // The default body still follows, so normal crawlers keep their rules.
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("layers AI stanzas on top of a custom robots.txt", () => {
    const custom = "User-agent: *\nDisallow: /secret/";
    const txt = generateRobotsTxt({
      siteUrl: "https://example.com",
      customContent: custom,
      discourageAiAgents: true,
    });
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain(custom);
  });

  it("skips AI stanzas for bots the custom content already addresses", () => {
    // An owner carve-out must not be contradicted by a prepended blanket
    // Disallow for the same token — duplicate groups mean different things
    // to merging (RFC 9309) vs first-match parsers.
    const custom = "User-agent: gptbot\nAllow: /public-docs/\n\nUser-agent: *\nDisallow: /secret/";
    const txt = generateRobotsTxt({
      siteUrl: "https://example.com",
      customContent: custom,
      discourageAiAgents: true,
    });
    expect(txt).not.toContain("User-agent: GPTBot\nDisallow: /");
    expect(txt).toContain("User-agent: ClaudeBot\nDisallow: /");
    expect(txt).toContain(custom);
  });

  it("does not duplicate AI stanzas when search-engine indexing is also discouraged", () => {
    const txt = generateRobotsTxt({
      siteUrl: "https://example.com",
      discourageIndexing: true,
      discourageAiAgents: true,
    });
    // discourageIndexing already blocks everyone; AI stanzas are redundant.
    expect(txt).not.toContain("User-agent: GPTBot");
    expect(txt).toContain("# Search-engine indexing is disabled in site settings.");
    expect(txt).toContain("Disallow: /");
  });
});

describe("generateRssFeed", () => {
  it("produces valid RSS 2.0 with empty items", () => {
    const xml = generateRssFeed({
      siteUrl: "https://example.com",
      siteTitle: "Test Blog"
    });
    expect(xml).toContain('<?xml version="1.0"');
    expect(xml).toContain('<rss version="2.0"');
    expect(xml).toContain("<channel>");
    expect(xml).toContain("Test Blog");
    expect(xml).toContain("</rss>");
  });

  it("includes items when provided", () => {
    const xml = generateRssFeed({
      siteUrl: "https://example.com",
      siteTitle: "Test",
      items: [{
        title: "Hello World",
        url: "https://example.com/hello-world",
        publishedAt: "2026-05-01T12:00:00Z",
        description: "First post"
      }]
    });
    expect(xml).toContain("Hello World");
    expect(xml).toContain("https://example.com/hello-world");
    expect(xml).toContain("First post");
  });

  it("includes atom:link self-reference", () => {
    const xml = generateRssFeed({
      siteUrl: "https://example.com",
      siteTitle: "Test"
    });
    expect(xml).toContain('atom:link href="https://example.com/rss.xml"');
  });
});
