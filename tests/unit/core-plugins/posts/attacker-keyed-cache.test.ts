import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { STAFF, staffDb } from "../../helpers/staff-db";

// Anonymous requests must not create a data-cache entry per made-up value:
// unknown /<slug> paths are rejected against one cached list of published
// slugs before the per-slug cache is touched, and the newspaper endpoint
// drops pillar ids that are not real pillars (security audit 2026-11-12,
// nextpress:cache:unstable-cache-attacker-keyed-entries).

const cacheCalls: string[] = [];
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown, keyParts: string[]) =>
    (...args: unknown[]) => {
      cacheCalls.push(`${keyParts.join("/")}(${JSON.stringify(args)})`);
      return fn(...args);
    },
}));
// Always take the cached path, as inside a Next request.
vi.mock("@core/caching/with-fallback", () => ({ cacheOrFallback: (primary: () => unknown) => primary() }));

const { db, ready } = staffDb("attacker-keyed-cache");
let pillarId = 0;

beforeAll(async () => {
  await ready;
  await import("@core/db/instance");
  const ins = async (title: string, slug: string, kind: string, parent: number | null) =>
    Number((await db.execute({
      sql: "INSERT INTO posts (title, slug, status, post_kind, parent_id, created_by, published_at) VALUES (?, ?, 'published', ?, ?, ?, '2026-11-01T00:00:00Z')",
      args: [title, slug, kind, parent, STAFF.editor.id],
    })).lastInsertRowid);
  pillarId = await ins("Sleep", "sleep", "pillar", null);
  await ins("Melatonin", "melatonin", "spike", pillarId);
  await db.execute({ sql: "INSERT INTO pages (title, slug, status, created_by) VALUES ('About', 'about', 'published', ?)", args: [STAFF.editor.id] });
});

beforeEach(() => {
  cacheCalls.length = 0;
});

const perSlug = () => cacheCalls.filter((c) => c.includes("by-slug"));

describe("public /<slug> lookups", () => {
  it("do not create a per-slug cache entry for an unknown slug", async () => {
    const { getPublishedRootPostBySlug } = await import("@core-plugins/posts/service");
    const { getPublishedPageBySlug } = await import("@core-plugins/pages/service");
    expect(await getPublishedPageBySlug(db, "no-such-page-123")).toBeNull();
    expect(await getPublishedRootPostBySlug(db, "no-such-page-123")).toBeNull();
    expect(perSlug()).toEqual([]);
  });

  it("still resolve real pages and root posts", async () => {
    const { getPublishedRootPostBySlug } = await import("@core-plugins/posts/service");
    const { getPublishedPageBySlug } = await import("@core-plugins/pages/service");
    expect((await getPublishedPageBySlug(db, "about"))?.title).toBe("About");
    expect((await getPublishedRootPostBySlug(db, "sleep"))?.title).toBe("Sleep");
  });
});

describe("newspaper endpoint", () => {
  it("drops pillar ids that are not real pillars before the cached list query", async () => {
    const { handleNewspaperPostsRequest } = await import("@/app/api/widgets/newspaper/posts/handler");
    const res = await handleNewspaperPostsRequest(new URL(`https://example.com/api/widgets/newspaper/posts?type=all&allType=pillar&scopes=987654,${pillarId},123456`));
    expect(res.status).toBe(200);
    const listKeys = cacheCalls.filter((c) => c.includes("posts-list"));
    expect(listKeys.some((c) => c.includes("987654") || c.includes("123456"))).toBe(false);
    expect((await res.json()).posts.map((p: { title: string }) => p.title)).toEqual(["Melatonin"]);
  });

  it("answers an empty list without a cached query when no id is a real pillar", async () => {
    const { handleNewspaperPostsRequest } = await import("@/app/api/widgets/newspaper/posts/handler");
    const res = await handleNewspaperPostsRequest(new URL("https://example.com/api/widgets/newspaper/posts?type=all&allType=pillar&scopes=987654,123456"));
    expect(res.status).toBe(200);
    expect((await res.json()).posts).toEqual([]);
    expect(cacheCalls.filter((c) => c.includes("posts-list"))).toEqual([]);
  });

  it("does the same for a single made-up pillar id", async () => {
    const { handleNewspaperPostsRequest } = await import("@/app/api/widgets/newspaper/posts/handler");
    const res = await handleNewspaperPostsRequest(new URL("https://example.com/api/widgets/newspaper/posts?type=pillar&scope=987654"));
    expect(res.status).toBe(200);
    expect((await res.json()).posts).toEqual([]);
    expect(cacheCalls.filter((c) => c.includes("posts-list"))).toEqual([]);
  });

  it("still serves a real single pillar", async () => {
    const { handleNewspaperPostsRequest } = await import("@/app/api/widgets/newspaper/posts/handler");
    const res = await handleNewspaperPostsRequest(new URL(`https://example.com/api/widgets/newspaper/posts?type=pillar&scope=${pillarId}`));
    expect((await res.json()).posts.map((p: { title: string }) => p.title)).toEqual(["Melatonin"]);
  });
});
