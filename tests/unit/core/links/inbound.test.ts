import { describe, it, expect } from "vitest";
import {
  normalizeUrl,
  extractRichTextHrefs,
  getCtaHref,
  walkContentJson,
  resolveTargetUrl,
  collectHitsForSource,
  groupByPillar,
  type InboundLink,
  type InboundLinkSource,
} from "@core/links/inbound-utils";

describe("normalizeUrl", () => {
  const HOST = "example.com";

  it("strips trailing slash", () => {
    expect(normalizeUrl("/foo/", HOST)).toBe("/foo");
  });
  it("preserves root path", () => {
    expect(normalizeUrl("/", HOST)).toBe("/");
  });
  it("strips query string", () => {
    expect(normalizeUrl("/foo?utm_source=x", HOST)).toBe("/foo");
  });
  it("strips hash", () => {
    expect(normalizeUrl("/foo#intro", HOST)).toBe("/foo");
  });
  it("strips trailing slash + query + hash together", () => {
    expect(normalizeUrl("/foo/?a=1#b", HOST)).toBe("/foo");
  });
  it("rewrites absolute URL on the same host to a path", () => {
    expect(normalizeUrl("https://example.com/foo", HOST)).toBe("/foo");
  });
  it("returns null for absolute URL on a different host", () => {
    expect(normalizeUrl("https://other.com/foo", HOST)).toBeNull();
  });
  it("returns null for mailto:", () => {
    expect(normalizeUrl("mailto:a@b.com", HOST)).toBeNull();
  });
  it("returns null for tel:", () => {
    expect(normalizeUrl("tel:+15551234", HOST)).toBeNull();
  });
  it("returns null for empty / whitespace", () => {
    expect(normalizeUrl("", HOST)).toBeNull();
    expect(normalizeUrl("   ", HOST)).toBeNull();
  });
  it("matches absolute URL on same host regardless of port", () => {
    // Dev servers run on :3000; absolute links written by authors against
    // the dev URL must still resolve to the canonical path.
    expect(normalizeUrl("http://example.com:3000/foo", HOST)).toBe("/foo");
    expect(normalizeUrl("https://example.com/foo", HOST)).toBe("/foo");
  });
});

describe("extractRichTextHrefs", () => {
  it("extracts a single href", () => {
    expect(extractRichTextHrefs('<p><a href="/foo">x</a></p>')).toEqual(["/foo"]);
  });
  it("extracts multiple hrefs preserving order", () => {
    expect(
      extractRichTextHrefs('<p><a href="/a">a</a> and <a href="/b">b</a></p>'),
    ).toEqual(["/a", "/b"]);
  });
  it("ignores attribute order — target/rel/class around href", () => {
    expect(
      extractRichTextHrefs(
        '<a class="x" target="_blank" rel="noopener noreferrer" href="/foo">x</a>',
      ),
    ).toEqual(["/foo"]);
  });
  it("returns [] for HTML with no anchors", () => {
    expect(extractRichTextHrefs("<p>no links here</p>")).toEqual([]);
  });
  it("returns [] for empty input", () => {
    expect(extractRichTextHrefs("")).toEqual([]);
  });
  it("does not throw on malformed HTML", () => {
    expect(() => extractRichTextHrefs("<a href=")).not.toThrow();
    expect(extractRichTextHrefs("<a href=")).toEqual([]);
  });
  it("decodes &amp; in href (ProseMirror escapes ampersands)", () => {
    expect(extractRichTextHrefs('<a href="/foo?a=1&amp;b=2">x</a>')).toEqual([
      "/foo?a=1&b=2",
    ]);
  });
});

describe("getCtaHref", () => {
  it("Hero → props.ctaHref", () => {
    expect(getCtaHref({ type: "Hero", props: { ctaHref: "/foo" } })).toBe("/foo");
  });
  it("Banner → props.href", () => {
    expect(getCtaHref({ type: "Banner", props: { href: "/foo" } })).toBe("/foo");
  });
  it("Button → props.href", () => {
    expect(getCtaHref({ type: "Button", props: { href: "/foo" } })).toBe("/foo");
  });
  it("returns null for unknown block name", () => {
    expect(getCtaHref({ type: "RichText", props: { html: "<p/>" } })).toBeNull();
  });
  it("returns null when href is missing or non-string", () => {
    expect(getCtaHref({ type: "Hero", props: {} })).toBeNull();
    expect(getCtaHref({ type: "Banner", props: { href: null } })).toBeNull();
    expect(getCtaHref({ type: "Button", props: { href: 123 } })).toBeNull();
  });
});

describe("walkContentJson", () => {
  it("collects content[] blocks", () => {
    const parsed = {
      root: { props: {} },
      content: [
        { type: "RichText", props: { html: "<p/>" } },
        { type: "Hero", props: { ctaHref: "/x" } },
      ],
      zones: {},
    };
    expect(walkContentJson(parsed)).toHaveLength(2);
  });
  it("collects blocks across multiple zones", () => {
    const parsed = {
      root: {},
      content: [],
      zones: {
        "zone-1:slot": [{ type: "Banner", props: { href: "/a" } }],
        "zone-2:slot": [{ type: "Button", props: { href: "/b" } }],
      },
    };
    const blocks = walkContentJson(parsed);
    expect(blocks).toHaveLength(2);
    expect(blocks.map((b) => b.type).sort()).toEqual(["Banner", "Button"]);
  });
  it("returns [] for null / undefined input", () => {
    expect(walkContentJson(null)).toEqual([]);
    expect(walkContentJson(undefined)).toEqual([]);
  });
  it("tolerates missing content and zones", () => {
    expect(walkContentJson({ root: {} })).toEqual([]);
  });
  it("does not throw on malformed input", () => {
    expect(() => walkContentJson({ content: "not-an-array" } as unknown)).not.toThrow();
    expect(walkContentJson({ content: "not-an-array" } as unknown)).toEqual([]);
  });
});

describe("resolveTargetUrl", () => {
  it("page → /<slug>", () => {
    expect(resolveTargetUrl({ kind: "page", slug: "about" })).toBe("/about");
  });
  it("non-spike post → /<slug>", () => {
    expect(
      resolveTargetUrl({ kind: "post", slug: "intro", postKind: "pillar" }),
    ).toBe("/intro");
  });
  it("spike post → /<parentSlug>/<slug>", () => {
    expect(
      resolveTargetUrl({
        kind: "post",
        slug: "spike-1",
        postKind: "spike",
        parentSlug: "pillar-a",
      }),
    ).toBe("/pillar-a/spike-1");
  });
  it("spike post with missing parentSlug → /<slug> fallback", () => {
    expect(
      resolveTargetUrl({
        kind: "post",
        slug: "orphan",
        postKind: "spike",
        parentSlug: null,
      }),
    ).toBe("/orphan");
  });
});

describe("collectHitsForSource", () => {
  const HOST = "example.com";
  const blocks = [
    {
      type: "RichText",
      props: { html: '<a href="/target">x</a> <a href="/target#a">y</a>' },
    },
    { type: "Hero", props: { ctaHref: "/target" } },
    { type: "Banner", props: { href: "/other" } },
  ];

  it("counts per (source, kind) once — dedup multi-anchors", () => {
    expect(collectHitsForSource(blocks, "/target", HOST)).toEqual({
      richtext: 1,
      cta: 1,
    });
  });
  it("returns zero counts when no blocks match", () => {
    expect(collectHitsForSource(blocks, "/never", HOST)).toEqual({
      richtext: 0,
      cta: 0,
    });
  });
});

describe("groupByPillar", () => {
  const link = (over: Partial<InboundLinkSource> = {}): InboundLink => ({
    source: {
      kind: "page",
      id: 1,
      title: "Page",
      slug: "page",
      ...over,
    } as InboundLinkSource,
    hits: [{ kind: "richtext", count: 1 }],
  });

  it("returns [] for empty input", () => {
    expect(groupByPillar([])).toEqual([]);
  });
  it("places spike under parent pillar", () => {
    const groups = groupByPillar([
      link({
        kind: "post",
        id: 10,
        title: "Spike",
        slug: "spike-1",
        postKind: "spike",
        parentId: 5,
        parentSlug: "pillar-a",
        parentTitle: "Pillar A",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("pillar-5");
    expect(groups[0].label).toBe("Pillar A");
  });
  it("places page in 'Standalone & Pages' bucket with neutral bg", () => {
    const groups = groupByPillar([
      link({ kind: "page", id: 1, title: "About", slug: "about" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("standalone-pages");
    expect(groups[0].bgClass).toBe("bg-slate-50");
  });
  it("sorts pillar groups by title; standalone bucket last", () => {
    const groups = groupByPillar([
      link({
        kind: "post",
        id: 11,
        title: "S1",
        slug: "s1",
        postKind: "spike",
        parentId: 2,
        parentSlug: "b-pillar",
        parentTitle: "B",
      }),
      link({
        kind: "post",
        id: 12,
        title: "S2",
        slug: "s2",
        postKind: "spike",
        parentId: 1,
        parentSlug: "a-pillar",
        parentTitle: "A",
      }),
      link({ kind: "page", id: 99, title: "Root", slug: "root" }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(["A", "B", "Standalone & Pages"]);
  });
  it("groups multiple spikes under the same parent", () => {
    const groups = groupByPillar([
      link({
        kind: "post",
        id: 21,
        title: "Spike One",
        slug: "spike-1",
        postKind: "spike",
        parentId: 7,
        parentSlug: "x",
        parentTitle: "X",
      }),
      link({
        kind: "post",
        id: 22,
        title: "Spike Two",
        slug: "spike-2",
        postKind: "spike",
        parentId: 7,
        parentSlug: "x",
        parentTitle: "X",
      }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].links).toHaveLength(2);
  });
});
