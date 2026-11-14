import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { STAFF, staffDb, type StaffUser } from "../../helpers/staff-db";

// Renaming content creates a site-wide 301 only when that content was public,
// and an auto-redirect never deletes or overwrites a manual (admin) redirect
// (security audit 2026-11-12, nextpress:page-writes:draft-scope-slug-redirect-hijack).

let session: { user: StaffUser } | null = null;

vi.mock("next-auth", () => ({
  default: () => ({ auth: async () => null, handlers: {}, signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@core/auth", () => ({ auth: async () => session }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { db, ready } = staffDb("auto-redirect-scope");
let draftPage = 0;
let livePage = 0;

beforeAll(async () => {
  await ready;
  const ins = async (slug: string, status: string, owner: string) =>
    Number((await db.execute({ sql: "INSERT INTO pages (title, slug, status, created_by) VALUES (?, ?, ?, ?)", args: [slug, slug, status, owner] })).lastInsertRowid);
  draftPage = await ins("author-draft", "draft", STAFF.author.id);
  livePage = await ins("about-us", "published", STAFF.editor.id);
  await db.execute({ sql: "INSERT INTO posts (title, slug, status, created_by) VALUES ('Live post', 'live-post', 'published', ?)", args: [STAFF.editor.id] });
  await db.execute({ sql: "INSERT INTO redirects (from_path, to_path, status, source) VALUES ('/promo', '/landing', 301, 'manual')", args: [] });
});

beforeEach(() => {
  session = { user: { ...STAFF.author } };
});

async function redirectFrom(path: string): Promise<{ to: string; source: string } | null> {
  const r = await db.execute({ sql: "SELECT to_path, source FROM redirects WHERE from_path = ? AND active = 1", args: [path] });
  return r.rows[0] ? { to: String(r.rows[0].to_path), source: String(r.rows[0].source) } : null;
}

describe("renaming a never-published draft", () => {
  it("cannot plant a redirect on a live post's URL", async () => {
    const { updatePageAction } = await import("@/app/admin/(shell)/pages/actions");
    await updatePageAction(draftPage, { slug: "live-post" });
    await updatePageAction(draftPage, { slug: "somewhere-else" });
    expect(await redirectFrom("/live-post")).toBeNull();
  });

  it("cannot delete or overwrite an admin's manual redirect", async () => {
    const { updatePageAction } = await import("@/app/admin/(shell)/pages/actions");
    await updatePageAction(draftPage, { slug: "promo" });
    await updatePageAction(draftPage, { slug: "elsewhere" });
    expect(await redirectFrom("/promo")).toEqual({ to: "/landing", source: "manual" });
  });
});

describe("renaming published content", () => {
  it("still leaves a redirect from the old URL", async () => {
    session = { user: { ...STAFF.editor } };
    const { updatePageAction } = await import("@/app/admin/(shell)/pages/actions");
    await updatePageAction(livePage, { slug: "about" });
    expect(await redirectFrom("/about-us")).toEqual({ to: "/about", source: "slug_change" });
  });
});

describe("renaming onto an address a manual redirect already uses (#5)", () => {
  it("saves, keeps the manual redirect, and warns the editor that the page is hidden", async () => {
    session = { user: { ...STAFF.editor } };
    await db.execute({ sql: "INSERT INTO redirects (from_path, to_path, status, source) VALUES ('/offers', '/landing', 301, 'manual')", args: [] });
    const { updatePageAction } = await import("@/app/admin/(shell)/pages/actions");
    const r = await updatePageAction(livePage, { slug: "offers" });
    expect(r.ok).toBe(true);
    expect(r.ok && r.warning).toMatch(/\/offers/);
    expect(await redirectFrom("/offers")).toEqual({ to: "/landing", source: "manual" });
  });

  it("does not warn when no manual redirect is in the way", async () => {
    session = { user: { ...STAFF.editor } };
    const { updatePageAction } = await import("@/app/admin/(shell)/pages/actions");
    const r = await updatePageAction(livePage, { slug: "about-team" });
    expect(r.ok && r.warning).toBeFalsy();
  });
});
