import { describe, it, expect } from "vitest";
import { allowedOperations } from "@/app/admin/(shell)/api-tokens/buildRequest/scopes";

describe("allowedOperations", () => {
  it("returns [] for empty scopes", () => {
    expect(allowedOperations([])).toEqual([]);
  });

  it("wildcard grants all 8 operations", () => {
    const ops = allowedOperations(["*"]);
    expect(ops).toHaveLength(8);
    expect(ops).toContainEqual({ resource: "posts", method: "POST" });
    expect(ops).toContainEqual({ resource: "topics", method: "GET_BY_ID" });
  });

  it("posts:read grants GET + GET_BY_ID on posts only", () => {
    const ops = allowedOperations(["posts:read"]);
    expect(ops).toEqual([
      { resource: "posts", method: "GET" },
      { resource: "posts", method: "GET_BY_ID" },
    ]);
  });

  it("posts:write grants POST + PATCH on posts only", () => {
    const ops = allowedOperations(["posts:write"]);
    expect(ops).toEqual([
      { resource: "posts", method: "POST" },
      { resource: "posts", method: "PATCH" },
    ]);
  });

  it("taxonomies:read grants GET + GET_BY_ID on topics only", () => {
    const ops = allowedOperations(["taxonomies:read"]);
    expect(ops).toEqual([
      { resource: "topics", method: "GET" },
      { resource: "topics", method: "GET_BY_ID" },
    ]);
  });

  it("taxonomies:write grants POST + PATCH on topics only", () => {
    const ops = allowedOperations(["taxonomies:write"]);
    expect(ops).toEqual([
      { resource: "topics", method: "POST" },
      { resource: "topics", method: "PATCH" },
    ]);
  });

  it("unions multiple scopes without duplicates", () => {
    const ops = allowedOperations(["posts:read", "posts:write"]);
    expect(ops).toHaveLength(4);
    expect(ops).toContainEqual({ resource: "posts", method: "GET" });
    expect(ops).toContainEqual({ resource: "posts", method: "POST" });
  });

  it("ignores unknown scopes", () => {
    expect(allowedOperations(["media:read", "forms:read"])).toEqual([]);
  });
});
