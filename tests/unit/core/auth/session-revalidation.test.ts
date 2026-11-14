import { describe, it, expect, beforeAll, vi } from "vitest";
import { STAFF, staffDb } from "../../helpers/staff-db";

// Every session read re-validates the JWT against the database, so a
// revoked, expired, disabled, deleted or demoted session stops working on
// every server action and route — not only in the admin shell layout
// (security audit 2026-11-12: nextpress:auth:revocation-enforced-only-in-shell-layout,
// nextpress:auth:disable-and-demotion-do-not-revoke-session,
// nextpress:auth:freshness-trusts-refreshable-jwt-iat).

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { db, ready } = staffDb("session-revalidation");

beforeAll(async () => {
  await ready;
});

type Token = Record<string, unknown>;

async function jwt(token: Token, user?: Record<string, unknown>): Promise<Token | null> {
  const { authConfig } = await import("@core/auth/config");
  const cb = authConfig.callbacks!.jwt!;
  return (await cb({ token, user, account: null, trigger: user ? "signIn" : undefined } as never)) as Token | null;
}

async function signIn(u: { id: string; email: string; name: string; roles: string[] }): Promise<Token> {
  const t = await jwt({}, { id: u.id, email: u.email, name: u.name, roles: u.roles, emailVerifiedAt: null, status: "active" });
  expect(t).not.toBeNull();
  return t!;
}

const now = () => Math.floor(Date.now() / 1000);

describe("session revalidation on every read", () => {
  it("stamps an immutable authTime at sign-in and keeps a healthy session", async () => {
    const t = await signIn(STAFF.editor);
    expect(typeof t.authTime).toBe("number");
    const again = await jwt({ ...t, iat: now() + 999 });
    expect(again).not.toBeNull();
    expect(again!.authTime).toBe(t.authTime);
  });

  it("rejects a session created before the session was revoked, even if iat was refreshed", async () => {
    const t = await signIn(STAFF.editor);
    const later = new Date((Number(t.authTime) + 5) * 1000).toISOString();
    await db.execute({ sql: "INSERT INTO session_revocations (user_id, revoked_at, reason) VALUES (?, ?, 'manual') ON CONFLICT(user_id) DO UPDATE SET revoked_at = excluded.revoked_at", args: [STAFF.editor.id, later] });
    expect(await jwt({ ...t, iat: Number(t.authTime) + 60 })).toBeNull();
    await db.execute({ sql: "DELETE FROM session_revocations WHERE user_id = ?", args: [STAFF.editor.id] });
  });

  it("rejects a token without authTime (pre-upgrade cookie)", async () => {
    expect(await jwt({ sub: STAFF.editor.id, roles: ["editor"], iat: now() })).toBeNull();
  });

  it("rejects a session past the configured max age", async () => {
    const t = await signIn(STAFF.editor);
    expect(await jwt({ ...t, authTime: now() - 400 * 24 * 60 * 60 })).toBeNull();
  });

  it("rejects a disabled user's session", async () => {
    const t = await signIn(STAFF.author2);
    await db.execute({ sql: "UPDATE users SET status = 'disabled' WHERE id = ?", args: [STAFF.author2.id] });
    expect(await jwt(t)).toBeNull();
    await db.execute({ sql: "UPDATE users SET status = 'active' WHERE id = ?", args: [STAFF.author2.id] });
  });

  it("rejects a deleted user's session", async () => {
    const t = await signIn(STAFF.author2);
    await db.execute({ sql: "UPDATE users SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?", args: [STAFF.author2.id] });
    expect(await jwt(t)).toBeNull();
    await db.execute({ sql: "UPDATE users SET deleted_at = NULL WHERE id = ?", args: [STAFF.author2.id] });
  });

  it("replaces the frozen roles with the user's current roles", async () => {
    const t = await signIn({ ...STAFF.author, roles: ["admin"] });
    const next = await jwt(t);
    expect(next!.roles).toEqual(["author"]);
  });
});
