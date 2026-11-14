import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { STAFF, staffDb, type StaffUser } from "../../helpers/staff-db";

// Revision save/restore must apply the editor's own rules: edit only what
// you may edit, only publishers change status or dates, only admins change
// the author, and a revision restores only onto the item it came from
// (security audit 2026-11-12, nextpress:admin-revisions:auth-only-restore).

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
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { digest: `NEXT_REDIRECT;${to}` });
  },
}));

const { db, ready } = staffDb("revisions-authz");
let editorPost = 0;
let authorPost = 0;
let editorPage = 0;

beforeAll(async () => {
  await ready;
  const ins = async (sql: string, args: (string | number)[]) => Number((await db.execute({ sql, args })).lastInsertRowid);
  editorPost = await ins("INSERT INTO posts (title, slug, status, content_json, created_by) VALUES (?, ?, 'published', ?, ?)", ["Live", "live", '{"content":[]}', STAFF.editor.id]);
  authorPost = await ins("INSERT INTO posts (title, slug, status, content_json, created_by) VALUES (?, ?, 'draft', ?, ?)", ["Mine", "mine", '{"content":[]}', STAFF.author.id]);
  editorPage = await ins("INSERT INTO pages (title, slug, status, content_json, created_by) VALUES (?, ?, 'published', ?, ?)", ["About", "about", '{"content":[]}', STAFF.editor.id]);
});

beforeEach(() => {
  session = { user: { ...STAFF.author } };
});

async function post(id: number) {
  return (await db.execute({ sql: "SELECT title, status, content_json, created_by FROM posts WHERE id = ?", args: [id] })).rows[0]!;
}
async function latestRevisionId(kind: string, id: number): Promise<number> {
  return Number((await db.execute({ sql: "SELECT MAX(id) AS id FROM content_revisions WHERE kind = ? AND content_id = ?", args: [kind, id] })).rows[0]!.id);
}
function form(fields: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}
async function settle(p: Promise<unknown>): Promise<"redirect" | "ok" | "rejected"> {
  try {
    await p;
    return "ok";
  } catch (e) {
    return String((e as { digest?: string }).digest ?? "").startsWith("NEXT_REDIRECT") ? "redirect" : "rejected";
  }
}

describe("an author", () => {
  it("cannot plant a revision on someone else's post", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    const r = await m.saveRevisionAction("post", editorPost, { title: "Pwned", status: "published", contentJson: '{"content":["x"]}', authorId: STAFF.author.id });
    expect(r.ok).toBe(false);
  });

  it("cannot overwrite someone else's post or page with restoreBlockAction", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    expect(await settle(m.restoreBlockAction(form({ kind: "post", contentId: String(editorPost), newContentJson: '{"content":["defaced"]}' })))).toBe("rejected");
    expect(await settle(m.restoreBlockAction(form({ kind: "page", contentId: String(editorPage), newContentJson: '{"content":["defaced"]}' })))).toBe("rejected");
    expect(String((await post(editorPost)).content_json)).toBe('{"content":[]}');
  });

  it("cannot restore its own revision onto someone else's post", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    expect((await m.saveRevisionAction("post", authorPost, { title: "Mine v2", status: "published", contentJson: '{"content":["mine"]}', authorId: STAFF.author.id })).ok).toBe(true);
    const rev = await latestRevisionId("post", authorPost);
    expect(await settle(m.restorePostRevisionAction(editorPost, rev))).toBe("rejected");
    const row = await post(editorPost);
    expect(String(row.title)).toBe("Live");
    expect(String(row.created_by)).toBe(STAFF.editor.id);
  });

  it("can restore its own draft but cannot publish or re-author it that way", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    await m.saveRevisionAction("post", authorPost, { title: "Mine v3", status: "published", contentJson: '{"content":["v3"]}', authorId: STAFF.editor.id });
    const rev = await latestRevisionId("post", authorPost);
    expect(await settle(m.restorePostRevisionAction(authorPost, rev))).toBe("redirect");
    const row = await post(authorPost);
    expect(String(row.title)).toBe("Mine v3");
    expect(String(row.status)).toBe("draft");
    expect(String(row.created_by)).toBe(STAFF.author.id);
  });

  it("cannot read revisions of someone else's post", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    session = { user: { ...STAFF.editor } };
    await m.saveRevisionAction("post", editorPost, { title: "Live v2", status: "published", contentJson: "{}" });
    session = { user: { ...STAFF.author } };
    expect((await m.getRevisionsAction("post", editorPost)).ok).toBe(false);
    expect((await m.getRevisionAction(await latestRevisionId("post", editorPost))).ok).toBe(false);
  });
});

describe("an editor", () => {
  beforeEach(() => {
    session = { user: { ...STAFF.editor } };
  });

  it("can restore a revision of any post, including its status", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    await m.saveRevisionAction("post", editorPost, { title: "Live v9", status: "draft", contentJson: '{"content":["v9"]}' });
    const rev = await latestRevisionId("post", editorPost);
    expect(await settle(m.restorePostRevisionAction(editorPost, rev))).toBe("redirect");
    const row = await post(editorPost);
    expect(String(row.title)).toBe("Live v9");
    expect(String(row.status)).toBe("draft");
  });
});

describe("the history page title", () => {
  it("does not reveal the title of a post or page the viewer can't edit", async () => {
    const postHistory = await import("@/app/admin/(shell)/posts/[id]/history/page");
    const pageHistory = await import("@/app/admin/(shell)/pages/[id]/history/page");
    const meta = (m: typeof postHistory, id: number) => m.generateMetadata({ params: Promise.resolve({ id: String(id) }) });
    expect((await meta(postHistory, editorPost)).title).toBe("History");
    expect((await meta(pageHistory, editorPage)).title).toBe("History");
    expect((await meta(postHistory, authorPost)).title).toMatch(/^History — Mine/);
  });
});

describe("a role without topics.assign", () => {
  it("cannot change a post's topics by restoring a revision", async () => {
    const m = await import("@/app/admin/(shell)/revisions/actions");
    const { invalidateRolesCache } = await import("@core-plugins/users/permissions");
    const topic = Number((await db.execute("INSERT INTO topics (name, slug) VALUES ('Sleep', 'sleep-r')")).lastInsertRowid);
    const original = String((await db.execute("SELECT permissions FROM roles WHERE slug = 'author'")).rows[0]!.permissions);
    await db.execute({ sql: "UPDATE roles SET permissions = ? WHERE slug = 'author'", args: [JSON.stringify(JSON.parse(original).filter((p: string) => p !== "topics.assign"))] });
    invalidateRolesCache();
    try {
      await m.saveRevisionAction("post", authorPost, { title: "Mine", status: "draft", contentJson: "{}", topicIds: [topic] });
      expect(await settle(m.restorePostRevisionAction(authorPost, await latestRevisionId("post", authorPost)))).toBe("redirect");
      const n = Number((await db.execute({ sql: "SELECT COUNT(*) AS n FROM posts_topics WHERE post_id = ?", args: [authorPost] })).rows[0]!.n);
      expect(n).toBe(0);
    } finally {
      await db.execute({ sql: "UPDATE roles SET permissions = ? WHERE slug = 'author'", args: [original] });
      invalidateRolesCache();
    }
  });
});
