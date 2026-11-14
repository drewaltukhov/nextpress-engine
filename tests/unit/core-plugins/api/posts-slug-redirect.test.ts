import { describe, it, expect, beforeAll, vi } from "vitest";
import { NextRequest } from "next/server";
import { STAFF, staffDb } from "../../helpers/staff-db";

// Renaming a published post through the API leaves a redirect from the old
// URL, the same rule as the admin editor: published content only, pillar
// renames cascade to their spikes, and never over a manual redirect (#4).

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { db, ready } = staffDb("posts-slug-redirect");
let token = "";
const ids: Record<string, number> = {};

beforeAll(async () => {
  await ready;
  await import("@core/db/instance");
  const { createApiToken } = await import("@core-plugins/api/tokens");
  token = (await createApiToken(db, { userId: STAFF.admin.id, name: "CI deploy", scopes: ["*"], expiresAt: null, createdBy: STAFF.admin.id })).plaintext;
  const ins = async (slug: string, status: string, kind: string, parent: number | null) =>
    Number((await db.execute({
      sql: "INSERT INTO posts (title, slug, status, post_kind, parent_id, created_by) VALUES (?, ?, ?, ?, ?, ?)",
      args: [slug, slug, status, kind, parent, STAFF.admin.id],
    })).lastInsertRowid);
  ids.live = await ins("live-one", "published", "standalone", null);
  ids.draft = await ins("draft-one", "draft", "standalone", null);
  ids.pillar = await ins("pillar-one", "published", "pillar", null);
  ids.spike = await ins("spike-one", "published", "spike", ids.pillar);
  ids.toPublish = await ins("never-public", "draft", "standalone", null);
  ids.toUnpublish = await ins("was-public", "published", "standalone", null);
});

async function patch(id: number, body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/v1/posts/[id]/route");
  const req = new NextRequest(`http://localhost/api/v1/posts/${id}`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return PATCH(req);
}

async function redirectFrom(path: string) {
  const r = await db.execute({ sql: "SELECT to_path, source FROM redirects WHERE from_path = ? AND active = 1", args: [path] });
  return r.rows[0] ? { to: String(r.rows[0].to_path), source: String(r.rows[0].source) } : null;
}

describe("PATCH /api/v1/posts/:id slug change", () => {
  it("leaves a redirect from a published post's old URL", async () => {
    expect((await patch(ids.live!, { slug: "live-two" })).status).toBe(200);
    expect(await redirectFrom("/live-one")).toEqual({ to: "/live-two", source: "slug_change" });
  });

  it("does not touch the redirect table for a draft", async () => {
    expect((await patch(ids.draft!, { slug: "draft-two" })).status).toBe(200);
    expect(await redirectFrom("/draft-one")).toBeNull();
  });

  it("cascades a pillar rename to its spikes", async () => {
    expect((await patch(ids.pillar!, { slug: "pillar-two" })).status).toBe(200);
    expect(await redirectFrom("/pillar-one")).toEqual({ to: "/pillar-two", source: "slug_change" });
    expect(await redirectFrom("/pillar-one/spike-one")).toEqual({ to: "/pillar-two/spike-one", source: "slug_change" });
  });

  it("judges eligibility by the status BEFORE the request when status and slug change together", async () => {
    // Publishing a draft and renaming it: the old URL was never public.
    expect((await patch(ids.toPublish!, { status: "published", slug: "now-public" })).status).toBe(200);
    expect(await redirectFrom("/never-public")).toBeNull();
    // Unpublishing a live post and renaming it: the old URL was public.
    expect((await patch(ids.toUnpublish!, { status: "draft", slug: "was-public-2" })).status).toBe(200);
    expect(await redirectFrom("/was-public")).toEqual({ to: "/was-public-2", source: "slug_change" });
  });
});
