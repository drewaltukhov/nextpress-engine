import { describe, it, expect } from "vitest";
import {
  parseHtmlHead,
  extractJsonLd,
  resolveUrlToDbRow,
  runChecks,
  type MinimalDb,
} from "../../../scripts/seo-audit-utils";

describe("parseHtmlHead", () => {
  it("extracts the <title>", () => {
    expect(parseHtmlHead("<html><head><title>Hello</title></head></html>").title).toBe("Hello");
  });
  it("returns null title when absent", () => {
    expect(parseHtmlHead("<html><head></head></html>").title).toBeNull();
  });
  it("extracts name= and property= and http-equiv= metas", () => {
    const html =
      '<head><meta name="description" content="d"><meta property="og:title" content="ot"><meta http-equiv="content-type" content="text/html"></head>';
    const r = parseHtmlHead(html);
    expect(r.metas.get("description")).toBe("d");
    expect(r.metas.get("og:title")).toBe("ot");
    expect(r.metas.get("content-type")).toBe("text/html");
  });
  it("extracts canonical link", () => {
    expect(
      parseHtmlHead('<head><link rel="canonical" href="/foo"></head>').canonical,
    ).toBe("/foo");
    expect(parseHtmlHead("<head></head>").canonical).toBeNull();
  });
  it("extracts JSON-LD blocks (preserving order)", () => {
    const html =
      '<head><script type="application/ld+json">{"@type":"Article"}</script><script type="application/ld+json">{"@type":"FAQPage"}</script></head>';
    expect(parseHtmlHead(html).jsonLdBlocks).toEqual([
      '{"@type":"Article"}',
      '{"@type":"FAQPage"}',
    ]);
  });
  it("returns empty/defaults on empty input", () => {
    const r = parseHtmlHead("");
    expect(r.title).toBeNull();
    expect(r.metas.size).toBe(0);
    expect(r.canonical).toBeNull();
    expect(r.jsonLdBlocks).toEqual([]);
  });
  it("decodes entity-encoded content", () => {
    expect(
      parseHtmlHead('<head><meta name="description" content="A &amp; B"></head>').metas.get(
        "description",
      ),
    ).toBe("A & B");
  });
});

describe("extractJsonLd", () => {
  it("parses a single block", () => {
    expect(extractJsonLd(['{"@type":"Article","headline":"H"}'])).toEqual([
      { type: "Article", data: { "@type": "Article", headline: "H" } },
    ]);
  });
  it("parses multiple blocks", () => {
    const out = extractJsonLd([
      '{"@type":"Article","headline":"A"}',
      '{"@type":"FAQPage","name":"F"}',
    ]);
    expect(out.map((e) => e.type)).toEqual(["Article", "FAQPage"]);
  });
  it("flattens @graph entries", () => {
    const out = extractJsonLd([
      '{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"O"},{"@type":"WebSite","name":"S"}]}',
    ]);
    expect(out.map((e) => e.type).sort()).toEqual(["Organization", "WebSite"]);
  });
  it("ignores malformed JSON without throwing", () => {
    expect(() => extractJsonLd(["{not-json"])).not.toThrow();
    expect(extractJsonLd(["{not-json"])).toEqual([]);
  });
  it("returns [] for empty input", () => {
    expect(extractJsonLd([])).toEqual([]);
  });
});

function mockDb(rows: Record<string, Array<Record<string, unknown>>>): MinimalDb {
  return {
    execute: async ({ sql, args }: { sql: string; args: Array<string | number | bigint | boolean | null> }) => {
      const key = sql.includes("FROM pages")
        ? "pages"
        : sql.includes("FROM posts p")
          ? "posts"
          : sql.includes("FROM topics")
            ? "topics"
            : "unknown";
      // Args[0] is the slug for single-segment lookups; for spike lookups,
      // args[0] = parentSlug, args[1] = spikeSlug. Matching here is best-
      // effort against the rows shape used by the tests.
      const slug = String(args[0] ?? "");
      const slug2 = args.length > 1 ? String(args[1]) : null;
      let matches = (rows[key] ?? []).filter((r) => r.slug === slug);
      if (key === "posts" && slug2) {
        // spike-style query: needs both parentSlug + spikeSlug to match
        const parentRow = (rows.posts ?? []).find((r) => r.slug === slug && r.parent_id == null);
        const parent = parentRow as Record<string, unknown> | undefined;
        matches = (rows.posts ?? []).filter(
          (r) => r.slug === slug2 && parent != null && r.parent_id === parent.id,
        );
      }
      return { rows: matches };
    },
  };
}

describe("resolveUrlToDbRow", () => {
  const BASE = "http://localhost:3000";

  it("identifies homepage", async () => {
    const db = mockDb({});
    const r = await resolveUrlToDbRow(`${BASE}/`, BASE, db);
    expect(r).toEqual({ kind: "homepage", id: null, row: null });
  });
  it("resolves /topics/<slug>", async () => {
    const db = mockDb({ topics: [{ id: 5, slug: "coffee", name: "Coffee" }] });
    const r = await resolveUrlToDbRow(`${BASE}/topics/coffee`, BASE, db);
    expect(r?.kind).toBe("topic");
    expect(r?.id).toBe(5);
  });
  it("resolves /<slug> as page first", async () => {
    const db = mockDb({ pages: [{ id: 1, slug: "about", title: "About" }] });
    const r = await resolveUrlToDbRow(`${BASE}/about`, BASE, db);
    expect(r?.kind).toBe("page");
  });
  it("falls back to root post when no matching page", async () => {
    const db = mockDb({
      pages: [],
      posts: [{ id: 9, slug: "intro", post_kind: "pillar", parent_id: null }],
    });
    const r = await resolveUrlToDbRow(`${BASE}/intro`, BASE, db);
    expect(r?.kind).toBe("post");
    expect(r?.id).toBe(9);
  });
  it("resolves /<pillar>/<spike>", async () => {
    const db = mockDb({
      posts: [
        { id: 7, slug: "coffee", post_kind: "pillar", parent_id: null },
        { id: 11, slug: "espresso", post_kind: "spike", parent_id: 7 },
      ],
    });
    const r = await resolveUrlToDbRow(`${BASE}/coffee/espresso`, BASE, db);
    expect(r?.kind).toBe("post");
    expect(r?.id).toBe(11);
  });
  it("returns null for paths it can't recognize", async () => {
    const db = mockDb({});
    expect(await resolveUrlToDbRow(`${BASE}/a/b/c`, BASE, db)).toBeNull();
  });
});

describe("runChecks", () => {
  const baseUrl = "http://localhost:3000";

  function makeRow(over: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id: 1,
      slug: "about",
      title: "About",
      seo_title: null,
      seo_description: null,
      excerpt: "An excerpt",
      seo_canonical: null,
      seo_robots: "index,follow",
      seo_og_image: null,
      featured_image: null,
      schema_types: '["Article"]',
      ...over,
    };
  }

  function makeHead(over: Partial<Record<string, unknown>> = {}): {
    title: string | null;
    metas: Map<string, string>;
    canonical: string | null;
    jsonLdBlocks: string[];
  } {
    return {
      title: (over.title as string | null) ?? null,
      metas: (over.metas as Map<string, string>) ?? new Map(),
      canonical: (over.canonical as string | null) ?? null,
      jsonLdBlocks: [],
    };
  }

  it("title precedence — seo_title wins", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead({ title: "SEO Override" }),
      jsonLd: [],
      row: makeRow({ seo_title: "SEO Override" }),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "title")?.status).toBe("pass");
  });
  it("title precedence — falls back to natural title", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead({ title: "About" }),
      jsonLd: [],
      row: makeRow(),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "title")?.status).toBe("pass");
  });
  it("description falls back to excerpt", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead({ metas: new Map([["description", "An excerpt"]]) }),
      jsonLd: [],
      row: makeRow(),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "description")?.status).toBe("pass");
  });
  it("canonical normalized — uses URL when seo_canonical absent", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead({ canonical: `${baseUrl}/about` }),
      jsonLd: [],
      row: makeRow(),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "canonical")?.status).toBe("pass");
  });
  it("flags missing JSON-LD type", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead(),
      jsonLd: [],
      row: makeRow({ schema_types: '["Article"]' }),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "jsonld-presence")?.status).toBe("fail");
  });
  it("og-image consistency with JSON-LD image — both absolutized", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead({ metas: new Map([["og:image", `${baseUrl}/img/a.jpg`]]) }),
      jsonLd: [
        { type: "Article", data: { "@type": "Article", image: `${baseUrl}/img/a.jpg` } },
      ],
      row: makeRow({ schema_types: '["Article"]', seo_og_image: "/img/a.jpg" }),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "jsonld-image-consistency")?.status).toBe("pass");
  });
  it("og-image — relative DB value matches absolute rendered value", () => {
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head: makeHead({ metas: new Map([["og:image", `${baseUrl}/img/a.jpg`]]) }),
      jsonLd: [],
      row: makeRow({ seo_og_image: "/img/a.jpg" }),
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "og-image")?.status).toBe("pass");
  });
  it("og-title and twitter-title include the title suffix", () => {
    const head = makeHead({
      title: "About | NextPress",
      metas: new Map([
        ["og:title", "About | NextPress"],
        ["twitter:title", "About | NextPress"],
      ]),
    });
    const r = runChecks({
      kind: "page",
      url: `${baseUrl}/about`,
      baseUrl,
      head,
      jsonLd: [],
      row: makeRow({ schema_types: "[]" }),
      titleSuffix: " | NextPress",
    });
    expect(r.find((c) => c.kind === "og-title")?.status).toBe("pass");
    expect(r.find((c) => c.kind === "twitter-title")?.status).toBe("pass");
  });
  it("works for topics — uses `name` as title source", () => {
    const r = runChecks({
      kind: "topic",
      url: `${baseUrl}/topics/coffee`,
      baseUrl,
      head: makeHead({ title: "Coffee" }),
      jsonLd: [],
      row: { id: 5, slug: "coffee", name: "Coffee", description: "About coffee", schema_types: "[]" },
      titleSuffix: "",
    });
    expect(r.find((c) => c.kind === "title")?.status).toBe("pass");
  });
  it("returns [] when row is null", () => {
    expect(
      runChecks({
        kind: "homepage",
        url: `${baseUrl}/`,
        baseUrl,
        head: makeHead(),
        jsonLd: [],
        row: null,
        titleSuffix: "",
      }),
    ).toEqual([]);
  });
});
