import { describe, it, expect, beforeAll } from "vitest";
import { STAFF, staffDb } from "../../helpers/staff-db";
import { createApiToken, hashToken, lookupActiveToken } from "@core-plugins/api/tokens";

// Only administrators can mint API tokens (My Tokens checks the admin
// role), so a token is only as good as its
// owner's admin role: demoting the owner must stop the token at once, not
// leave it with the scopes it was minted with (security audit 2026-11-12,
// nextpress:api-tokens:scopes-not-bound-to-owner-role).

const { db, ready } = staffDb("token-owner-role");
let plaintext = "";

beforeAll(async () => {
  await ready;
  const t = await createApiToken(db, { userId: STAFF.admin.id, name: "CI deploy", scopes: ["*"], expiresAt: null, createdBy: STAFF.admin.id });
  plaintext = t.plaintext;
});

const setRole = (role: string) =>
  db.execute({ sql: "UPDATE user_roles SET role_slug = ? WHERE user_id = ?", args: [role, STAFF.admin.id] });

describe("lookupActiveToken", () => {
  it("accepts a token whose owner is an active admin", async () => {
    expect((await lookupActiveToken(db, hashToken(plaintext)))?.scopes).toEqual(["*"]);
  });

  it("refuses the token once its owner is no longer an admin, and accepts it again when restored", async () => {
    await setRole("editor");
    expect(await lookupActiveToken(db, hashToken(plaintext))).toBeNull();
    await setRole("admin");
    expect(await lookupActiveToken(db, hashToken(plaintext))).not.toBeNull();
  });

  it("still refuses a disabled owner", async () => {
    await db.execute({ sql: "UPDATE users SET status = 'disabled' WHERE id = ?", args: [STAFF.admin.id] });
    expect(await lookupActiveToken(db, hashToken(plaintext))).toBeNull();
    await db.execute({ sql: "UPDATE users SET status = 'active' WHERE id = ?", args: [STAFF.admin.id] });
  });
});
