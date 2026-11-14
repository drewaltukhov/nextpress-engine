import { describe, it, expect, beforeAll, vi } from "vitest";
import { STAFF, staffDb } from "../../helpers/staff-db";

// The proxy's edge session only checks the cookie signature, while the Node
// jwt callback re-validates against the database. A session the database has
// ended must be caught in the proxy: otherwise /admin pages redirect to
// /admin/login, the proxy (still seeing a valid cookie) redirects back to
// /admin, and the browser loops until it gives up — including for every
// pre-deploy session, which has no authTime claim. The proxy hands such a
// session to /admin/force-logout, which clears it (dual review, PR #2 round 2).

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { db, ready } = staffDb("stale-session-gate");
const now = () => Math.floor(Date.now() / 1000);

beforeAll(async () => {
  await ready;
  // Registers the runtime DB accessor the session cache reads through.
  await import("@core/db/instance");
});

async function gate(auth: { user?: { id?: string; iat?: number | null } } | null) {
  const { staleSessionRedirect } = await import("@core/auth/stale-session-gate");
  return staleSessionRedirect(db, auth);
}

describe("staleSessionRedirect", () => {
  it("lets a healthy session and a signed-out request through", async () => {
    expect(await gate({ user: { id: STAFF.editor.id, iat: now() } })).toBeNull();
    expect(await gate(null)).toBeNull();
  });

  it("sends a pre-deploy session without authTime to force-logout", async () => {
    expect(await gate({ user: { id: STAFF.editor.id, iat: null } })).toBe("/admin/force-logout?reason=missing_iat");
  });

  it("sends a revoked session to force-logout with the reason", async () => {
    const iat = now() - 60;
    await db.execute({
      sql: "INSERT INTO session_revocations (user_id, revoked_at, reason) VALUES (?, ?, 'manual')",
      args: [STAFF.author2.id, new Date().toISOString()],
    });
    const { invalidateUserCache } = await import("@core/auth/user-session-cache");
    invalidateUserCache();
    expect(await gate({ user: { id: STAFF.author2.id, iat } })).toBe("/admin/force-logout?reason=revoked");
  });
});
