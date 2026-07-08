import { describe, it, expect } from "vitest";
import {
  parseNewspaperQuery,
  type ParsedNewspaperQuery,
} from "@/app/api/widgets/newspaper/posts/parse-query";

function urlSearch(params: Record<string, string>): URLSearchParams {
  return new URLSearchParams(params);
}

describe("parseNewspaperQuery", () => {
  it("parses a single-pillar query", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "42", limit: "5" }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual<ParsedNewspaperQuery>({
        kind: "single",
        type: "pillar",
        key: "42",
        limit: 5,
        offset: 0,
      });
    }
  });

  it("parses a single-topic query with offset", () => {
    const r = parseNewspaperQuery(
      urlSearch({ type: "topic", scope: "reviews", limit: "3", offset: "6" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual<ParsedNewspaperQuery>({
        kind: "single",
        type: "topic",
        key: "reviews",
        limit: 3,
        offset: 6,
      });
    }
  });

  it("parses an all-topic query (CSV scopes)", () => {
    const r = parseNewspaperQuery(
      urlSearch({ type: "all", allType: "topic", scopes: "pills,creams,volume", limit: "5" }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).toEqual<ParsedNewspaperQuery>({
        kind: "all",
        allType: "topic",
        keys: ["pills", "creams", "volume"],
        limit: 5,
        offset: 0,
      });
    }
  });

  it("rejects missing type", () => {
    const r = parseNewspaperQuery(urlSearch({ scope: "x" }));
    expect(r.ok).toBe(false);
  });

  it("rejects type=single without scope", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "pillar" }));
    expect(r.ok).toBe(false);
  });

  it("accepts type=all without scopes as no-narrowing sentinel", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "all", allType: "topic" }));
    expect(r.ok).toBe(true);
    if (r.ok && r.value.kind === "all") expect(r.value.keys).toEqual([]);
  });

  it("rejects type=all without allType", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "all", scopes: "a,b" }));
    expect(r.ok).toBe(false);
  });

  it("clamps limit to [1, 24] and defaults to 5", () => {
    const a = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "1" }));
    const b = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "1", limit: "0" }));
    const c = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "1", limit: "999" }));
    expect(a.ok && a.value.limit).toBe(5);
    expect(b.ok && b.value.limit).toBe(1);
    expect(c.ok && c.value.limit).toBe(24);
  });

  it("clamps offset to [0, 200] and defaults to 0", () => {
    const a = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "1", offset: "-5" }));
    const b = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "1", offset: "9999" }));
    expect(a.ok && a.value.offset).toBe(0);
    expect(b.ok && b.value.offset).toBe(200);
  });

  it("rejects pillar scope that isn't a positive integer", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "pillar", scope: "not-a-number" }));
    expect(r.ok).toBe(false);
  });

  it("rejects topic slug with invalid characters", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "topic", scope: "../etc/passwd" }));
    expect(r.ok).toBe(false);
  });

  it("rejects topic slug with trailing hyphen", () => {
    const r = parseNewspaperQuery(urlSearch({ type: "topic", scope: "foo-" }));
    expect(r.ok).toBe(false);
  });

  it("rejects all-scope with more than 50 keys", () => {
    const tooMany = Array.from({ length: 51 }, (_, i) => `t${i}`).join(",");
    const r = parseNewspaperQuery(
      urlSearch({ type: "all", allType: "topic", scopes: tooMany }),
    );
    expect(r.ok).toBe(false);
  });
});
