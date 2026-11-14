import { describe, it, expect, beforeAll, beforeEach, vi } from "vitest";
import { STAFF, staffDb } from "../../helpers/staff-db";

// Self-service password reset must not reveal which emails are registered
// (timing) and must not let anonymous callers burn the site's mail quota
// (security audit 2026-11-12: nextpress:forgot-password:enumeration-timing-oracle,
// nextpress:forgot-password:reset-email-quota-flood).

const sent: string[] = [];
vi.mock("@core/email", () => ({ sendEmail: async ({ input }: { input: { to: string } }) => { sent.push(input.to); return { ok: true }; } }));
vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { db, ready } = staffDb("forgot-password");

beforeAll(async () => {
  await ready;
});

beforeEach(async () => {
  sent.length = 0;
  await db.execute("DELETE FROM user_email_tokens");
  const { __resetSelfResetLimits } = await import("@core-plugins/users/self-reset");
  __resetSelfResetLimits();
});

async function tokenCount(): Promise<number> {
  return Number((await db.execute("SELECT COUNT(*) AS n FROM user_email_tokens WHERE purpose = 'reset_password'")).rows[0]!.n);
}

describe("the forgot-password action", () => {
  it("answers without waiting on any account lookup", async () => {
    vi.resetModules();
    vi.doMock("@core/db/instance", () => ({ db: () => ({ execute: () => new Promise(() => {}) }) }));
    vi.doMock("next/headers", () => ({ headers: async () => new Headers({ host: "localhost", "cf-connecting-ip": "198.51.100.1" }) }));
    // The work must be handed to after() (kept alive on serverless), not
    // left as a bare floating promise.
    const scheduled: unknown[] = [];
    vi.doMock("next/server", async (orig) => ({
      ...(await orig<typeof import("next/server")>()),
      after: (task: unknown) => { scheduled.push(task); },
    }));
    const { requestSelfPasswordReset } = await import("@/app/admin/forgot-password/actions");
    const result = await Promise.race([
      requestSelfPasswordReset(STAFF.editor.email),
      new Promise((r) => setTimeout(() => r("timed out"), 500)),
    ]);
    expect(result).toEqual({ ok: true });
    expect(scheduled).toHaveLength(1);
    vi.doUnmock("@core/db/instance");
    vi.doUnmock("next/headers");
    vi.doUnmock("next/server");
    vi.resetModules();
  });
});

describe("processSelfPasswordReset", () => {
  it("issues a token and sends one email for a registered address", async () => {
    const { processSelfPasswordReset } = await import("@core-plugins/users/self-reset");
    await processSelfPasswordReset(db, { email: STAFF.editor.email, ip: "198.51.100.2", origin: "http://localhost" });
    expect(await tokenCount()).toBe(1);
    expect(sent).toEqual([STAFF.editor.email]);
  });

  it("caps reset emails per IP address per hour", async () => {
    const { processSelfPasswordReset, PER_IP_HOURLY_LIMIT } = await import("@core-plugins/users/self-reset");
    const targets = [STAFF.admin, STAFF.editor, STAFF.author, STAFF.author2];
    for (let i = 0; i < PER_IP_HOURLY_LIMIT + 3; i++) {
      await db.execute("DELETE FROM user_email_tokens"); // defeat the per-user minute limit
      await processSelfPasswordReset(db, { email: targets[i % targets.length]!.email, ip: "203.0.113.9", origin: "http://localhost" });
    }
    expect(sent.length).toBe(PER_IP_HOURLY_LIMIT);
  });

  it("caps reset emails site-wide per hour, whatever the IP", async () => {
    const { processSelfPasswordReset, SITE_HOURLY_LIMIT } = await import("@core-plugins/users/self-reset");
    for (let i = 0; i < SITE_HOURLY_LIMIT; i++) {
      await db.execute({ sql: "INSERT INTO user_email_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'reset_password', ?, datetime('now', '+1 day'))", args: [STAFF.admin.id, `seed-${i}`] });
    }
    await processSelfPasswordReset(db, { email: STAFF.editor.email, ip: "198.51.100.77", origin: "http://localhost" });
    expect(sent).toEqual([]);
  });

  it("never exceeds the site-wide cap under concurrent requests for different accounts", async () => {
    const { processSelfPasswordReset, SITE_HOURLY_LIMIT } = await import("@core-plugins/users/self-reset");
    for (let i = 0; i < SITE_HOURLY_LIMIT - 1; i++) {
      await db.execute({ sql: "INSERT INTO user_email_tokens (user_id, purpose, token_hash, expires_at) VALUES (?, 'reset_password', ?, datetime('now', '+1 day'))", args: [STAFF.admin.id, `near-cap-${i}`] });
    }
    const targets = [STAFF.editor, STAFF.author, STAFF.author2];
    await Promise.all(targets.map((u, i) => processSelfPasswordReset(db, { email: u.email, ip: `198.51.100.${40 + i}`, origin: "http://localhost" })));
    expect(sent.length).toBe(1);
  });

  it("sends only one email for concurrent requests for the same account", async () => {
    const { processSelfPasswordReset } = await import("@core-plugins/users/self-reset");
    await Promise.all(
      Array.from({ length: 5 }, (_, i) => processSelfPasswordReset(db, { email: STAFF.author.email, ip: `198.51.100.${10 + i}`, origin: "http://localhost" })),
    );
    expect(sent.length).toBe(1);
    expect(await tokenCount()).toBe(1);
  });

  it("does nothing for an unknown address", async () => {
    const { processSelfPasswordReset } = await import("@core-plugins/users/self-reset");
    await processSelfPasswordReset(db, { email: "nobody@example.com", ip: "198.51.100.3", origin: "http://localhost" });
    expect(await tokenCount()).toBe(0);
    expect(sent).toEqual([]);
  });
});

describe("issueEmailTokenIf", () => {
  it("writes nothing when the condition fails, and the token when it holds", async () => {
    const { issueEmailTokenIf } = await import("@core-plugins/users/tokens");
    const before = await tokenCount();
    const refused = await issueEmailTokenIf({ db, userId: STAFF.editor.id, purpose: "reset_password", where: "? = 0", whereArgs: [1] });
    expect(refused).toBeNull();
    expect(await tokenCount()).toBe(before);
    const issued = await issueEmailTokenIf({ db, userId: STAFF.editor.id, purpose: "reset_password", where: "? = 1", whereArgs: [1] });
    expect(issued?.token).toBeTruthy();
    expect(await tokenCount()).toBe(before + 1);
  });
});
