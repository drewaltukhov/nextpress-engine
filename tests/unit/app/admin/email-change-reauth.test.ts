import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { STAFF, staffDb, type StaffUser } from "../../helpers/staff-db";
import { hashPassword } from "@core-plugins/users/passwords";

// Changing an account's email (the password-recovery channel) needs the
// actor's current password, and a pending change dies once the account's
// sessions are revoked, e.g. by a password reset (security audit
// 2026-11-12: nextpress:email-change:no-reauth-before-recovery-address-change,
// nextpress:email-change:pending-change-survives-password-reset).

let session: { user: StaffUser } | null = null;
const sent: Array<{ to: string; text?: string; html?: string }> = [];

vi.mock("next-auth", () => ({
  default: () => ({ auth: async () => null, handlers: {}, signIn: async () => {}, signOut: async () => {} }),
}));
vi.mock("@core/auth", () => ({ auth: async () => session }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost:3000" }) }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));
vi.mock("@core/email", () => ({
  sendEmail: async (m: { input: { to: string; text?: string; html?: string } }) => {
    sent.push(m.input);
    return { ok: true };
  },
}));

const PASSWORD = "correct horse battery staple";
const { db, ready } = staffDb("email-change-reauth");

beforeAll(async () => {
  await ready;
  for (const u of Object.values(STAFF)) {
    await db.execute({ sql: "INSERT INTO user_credentials (user_id, password_hash) VALUES (?, ?)", args: [u.id, await hashPassword(PASSWORD)] });
  }
});

beforeEach(() => {
  sent.length = 0;
  session = { user: { ...STAFF.author } };
});

async function emailOf(id: string): Promise<string> {
  return String((await db.execute({ sql: "SELECT email FROM users WHERE id = ?", args: [id] })).rows[0]!.email);
}
// The confirm link goes to the new address; a heads-up then goes to the old one.
function tokenFromLastMail(): string {
  const body = sent.map((m) => `${m.text ?? ""} ${m.html ?? ""}`).join(" ");
  const m = body.match(/confirm-email\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error("no confirm link in mail");
  return m[1]!;
}

describe("self-service email change", () => {
  it("is refused without the current password", async () => {
    const { requestEmailChange } = await import("@/app/admin/(shell)/profile/actions");
    expect((await requestEmailChange("new-al@example.com", "")).ok).toBe(false);
    expect((await requestEmailChange("new-al@example.com", "wrong password")).ok).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it("works with the current password", async () => {
    const { requestEmailChange, confirmEmailChange } = await import("@/app/admin/(shell)/profile/actions");
    expect(await requestEmailChange("al2@example.com", PASSWORD)).toEqual({ ok: true });
    const r = await confirmEmailChange(tokenFromLastMail());
    expect(r.ok).toBe(true);
    expect(await emailOf(STAFF.author.id)).toBe("al2@example.com");
  });

  it("a pending change requested before a session revocation can no longer be confirmed", async () => {
    session = { user: { ...STAFF.author2 } };
    const { requestEmailChange, confirmEmailChange } = await import("@/app/admin/(shell)/profile/actions");
    expect(await requestEmailChange("intruder@example.com", PASSWORD)).toEqual({ ok: true });
    const token = tokenFromLastMail();
    // The owner recovers the account (password reset writes a revocation).
    const later = new Date(Date.now() + 1000).toISOString();
    await db.execute({ sql: "INSERT INTO session_revocations (user_id, revoked_at, reason) VALUES (?, ?, 'password_change') ON CONFLICT(user_id) DO UPDATE SET revoked_at = excluded.revoked_at", args: [STAFF.author2.id, later] });
    const r = await confirmEmailChange(token);
    expect(r.ok).toBe(false);
    expect(await emailOf(STAFF.author2.id)).toBe(STAFF.author2.email);
  });
});

describe("admin email changes", () => {
  beforeEach(() => {
    session = { user: { ...STAFF.admin } };
  });

  it("need the admin's own current password", async () => {
    const { changeEmailDirect } = await import("@/app/admin/(shell)/users/actions");
    expect((await changeEmailDirect(STAFF.editor.id, "ed2@example.com", "")).ok).toBe(false);
    expect(await emailOf(STAFF.editor.id)).toBe(STAFF.editor.email);
    expect(await changeEmailDirect(STAFF.editor.id, "ed2@example.com", PASSWORD)).toEqual({ ok: true });
    expect(await emailOf(STAFF.editor.id)).toBe("ed2@example.com");
  });
});
