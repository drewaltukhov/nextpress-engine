import { describe, it, expect } from "vitest";
import { buildSnippet } from "@/app/admin/(shell)/api-tokens/buildRequest/snippet";

const tokenPrefix = "npp_a3f9";
const baseUrl = "https://example.com";

describe("buildSnippet — cURL", () => {
  it("POST posts emits method + auth + content-type + body", () => {
    const out = buildSnippet(
      {
        resource: "posts",
        method: "POST",
        tokenPrefix,
        baseUrl,
        selectedFields: [
          { name: "title", value: "{{title}}" },
          { name: "status", value: "draft" },
        ],
      },
      "curl"
    );
    expect(out).toContain("curl -X POST");
    expect(out).toContain("https://example.com/api/v1/posts");
    expect(out).toContain("Authorization: Bearer npp_a3f9");
    expect(out).toContain("Content-Type: application/json");
    expect(out).toContain('"title": "{{title}}"');
    expect(out).toContain('"status": "draft"');
  });

  it("GET list has no -d flag, no content-type", () => {
    const out = buildSnippet(
      { resource: "posts", method: "GET", tokenPrefix, baseUrl, selectedFields: [] },
      "curl"
    );
    expect(out).toContain("curl -X GET");
    expect(out).not.toContain("Content-Type");
    expect(out).not.toContain("-d ");
  });

  it("PATCH includes id segment", () => {
    const out = buildSnippet(
      {
        resource: "posts",
        method: "PATCH",
        tokenPrefix,
        baseUrl,
        id: "42",
        selectedFields: [{ name: "title", value: "{{title}}" }],
      },
      "curl"
    );
    expect(out).toContain("/api/v1/posts/42");
    expect(out).toContain("curl -X PATCH");
  });

  it("token prefix is followed by placeholder suffix", () => {
    const out = buildSnippet(
      { resource: "posts", method: "POST", tokenPrefix, baseUrl, selectedFields: [] },
      "curl"
    );
    expect(out).toContain("Authorization: Bearer npp_a3f9xxxxxxxx…");
  });
});

describe("buildSnippet — Raw HTTP", () => {
  it("emits request line + Host header", () => {
    const out = buildSnippet(
      { resource: "posts", method: "POST", tokenPrefix, baseUrl, selectedFields: [] },
      "http"
    );
    expect(out.split("\n")[0]).toBe("POST /api/v1/posts HTTP/1.1");
    expect(out).toContain("Host: example.com");
  });

  it("body separated by blank line for POST", () => {
    const out = buildSnippet(
      {
        resource: "posts",
        method: "POST",
        tokenPrefix,
        baseUrl,
        selectedFields: [{ name: "title", value: "{{title}}" }],
      },
      "http"
    );
    expect(out).toMatch(/\n\n\{/);
  });
});

describe("buildSnippet — raw values", () => {
  it("emits raw value verbatim, not JSON-stringified", () => {
    const out = buildSnippet(
      {
        resource: "posts",
        method: "POST",
        tokenPrefix,
        baseUrl,
        selectedFields: [
          { name: "topic_ids", value: "[1, 2, 3]", raw: true },
          { name: "seo_exclude_from_sitemap", value: "false", raw: true },
        ],
      },
      "json"
    );
    expect(out).toBe('{\n  "topic_ids": [1, 2, 3],\n  "seo_exclude_from_sitemap": false\n}');
  });

  it("non-raw values are still string-quoted (default)", () => {
    const out = buildSnippet(
      {
        resource: "posts",
        method: "POST",
        tokenPrefix,
        baseUrl,
        selectedFields: [{ name: "topic_ids", value: "{{topic_ids}}" }],
      },
      "json"
    );
    expect(out).toBe('{\n  "topic_ids": "{{topic_ids}}"\n}');
  });
});

describe("buildSnippet — JSON body", () => {
  it("returns just the JSON body for POST", () => {
    const out = buildSnippet(
      {
        resource: "posts",
        method: "POST",
        tokenPrefix,
        baseUrl,
        selectedFields: [{ name: "title", value: "{{title}}" }],
      },
      "json"
    );
    expect(out).toBe('{\n  "title": "{{title}}"\n}');
  });

  it("empty body for POST with no fields is {}", () => {
    const out = buildSnippet(
      { resource: "posts", method: "POST", tokenPrefix, baseUrl, selectedFields: [] },
      "json"
    );
    expect(out).toBe("{}");
  });

  it("GET returns comment, not JSON", () => {
    const out = buildSnippet(
      { resource: "posts", method: "GET", tokenPrefix, baseUrl, selectedFields: [] },
      "json"
    );
    expect(out).toBe("// GET requests have no body");
  });

  it("topic GET_BY_ID uses topic id path", () => {
    const out = buildSnippet(
      {
        resource: "topics",
        method: "GET_BY_ID",
        tokenPrefix,
        baseUrl,
        id: "7",
        selectedFields: [],
      },
      "curl"
    );
    expect(out).toContain("/api/v1/topics/7");
    expect(out).toContain("curl -X GET");
  });
});
