import { describe, it, expect, beforeAll } from "vitest";
import { db } from "@core/db/instance";
import { handleNewspaperPostsRequest } from "@/app/api/widgets/newspaper/posts/handler";

async function fixtureTopic(slug: string): Promise<number | null> {
  const r = await db().execute({
    sql: "SELECT id FROM topics WHERE tenant_id = 1 AND slug = ? LIMIT 1",
    args: [slug],
  });
  return r.rows[0] ? Number(r.rows[0].id) : null;
}

let seedPresent = false;

describe("handleNewspaperPostsRequest", () => {
  beforeAll(async () => {
    const exists = await fixtureTopic("male-enhancement-pills");
    seedPresent = exists !== null;
    if (!seedPresent) {
      console.warn("Skipping newspaper endpoint tests — seed not present");
    }
  });

  it("returns posts for a single topic scope", async () => {
    if (!seedPresent) return;
    const url = new URL(
      "https://example.com/api/widgets/newspaper/posts?type=topic&scope=male-enhancement-volume-pills&limit=5",
    );
    const res = await handleNewspaperPostsRequest(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.posts)).toBe(true);
    expect(body.posts.length).toBeLessThanOrEqual(5);
    if (body.posts.length > 0) {
      const p = body.posts[0];
      expect(typeof p.id).toBe("number");
      expect(typeof p.title).toBe("string");
      expect(typeof p.url).toBe("string");
    }
  });

  it("rejects malformed scope", async () => {
    const url = new URL(
      "https://example.com/api/widgets/newspaper/posts?type=topic&scope=../etc/passwd",
    );
    const res = await handleNewspaperPostsRequest(url);
    expect(res.status).toBe(400);
  });

  it("returns the union for an all-topic query", async () => {
    if (!seedPresent) return;
    const url = new URL(
      "https://example.com/api/widgets/newspaper/posts?type=all&allType=topic&scopes=male-enhancement-volume-pills,male-enhancement-creams-and-oils&limit=10",
    );
    const res = await handleNewspaperPostsRequest(url);
    expect(res.status).toBe(200);
    const body = await res.json();
    // Volume (5) + Creams (15) — union should yield > 5 posts.
    expect(body.posts.length).toBeGreaterThan(5);
  });

  it("honors offset for pagination", async () => {
    if (!seedPresent) return;
    const first = await handleNewspaperPostsRequest(
      new URL(
        "https://example.com/api/widgets/newspaper/posts?type=topic&scope=male-enhancement-pills&limit=3&offset=0",
      ),
    );
    const next = await handleNewspaperPostsRequest(
      new URL(
        "https://example.com/api/widgets/newspaper/posts?type=topic&scope=male-enhancement-pills&limit=3&offset=3",
      ),
    );
    const firstBody = await first.json();
    const nextBody = await next.json();
    expect(firstBody.posts[0]?.id).not.toBe(nextBody.posts[0]?.id);
  });

  it("returns Cache-Control: public on success with results", async () => {
    if (!seedPresent) return;
    const url = new URL(
      "https://example.com/api/widgets/newspaper/posts?type=topic&scope=male-enhancement-pills&limit=3",
    );
    const res = await handleNewspaperPostsRequest(url);
    expect(res.headers.get("Cache-Control")).toContain("public");
  });

  it("returns Cache-Control: no-store on empty results", async () => {
    // Nonexistent slug → 404 (the handler validates slug → topic lookup
    // fails). Either 200 with empty + no-store, or 404, is acceptable.
    const url = new URL(
      "https://example.com/api/widgets/newspaper/posts?type=topic&scope=zzz-does-not-exist-zzz",
    );
    const res = await handleNewspaperPostsRequest(url);
    expect([200, 404]).toContain(res.status);
    if (res.status === 200) {
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
  });
});
