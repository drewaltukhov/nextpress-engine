import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  issueEmailToken,
  consumeEmailToken,
  pruneEmailTokens,
  hashToken
} from "@core-plugins/users/tokens";
import type { DbClient } from "@core/db/client";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      display_name TEXT NOT NULL DEFAULT ''
    )
  `);
  await db.execute(`
    CREATE TABLE user_email_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      purpose TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      consumed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.execute({
    sql: "INSERT INTO users (id, email) VALUES (?, ?)",
    args: ["u1", "alice@example.com"]
  });
}

describe("issueEmailToken", () => {
  let db: DbClient;
  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("issues a token and stores its hash, never the plain value", async () => {
    const issued = await issueEmailToken({ db, userId: "u1", purpose: "verify_email" });
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(issued.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.tokenHash).toBe(hashToken(issued.token));
    const r = await db.execute("SELECT token_hash, purpose FROM user_email_tokens");
    expect(r.rows[0]?.token_hash).toBe(issued.tokenHash);
    expect(r.rows[0]?.purpose).toBe("verify_email");
  });

  it("uses default TTLs per purpose", async () => {
    const verify = await issueEmailToken({ db, userId: "u1", purpose: "verify_email" });
    const invite = await issueEmailToken({ db, userId: "u1", purpose: "invite" });
    const verifyMs = new Date(verify.expiresAt).getTime() - Date.now();
    const inviteMs = new Date(invite.expiresAt).getTime() - Date.now();
    expect(verifyMs).toBeGreaterThan(23 * 60 * 60 * 1000);
    expect(verifyMs).toBeLessThan(25 * 60 * 60 * 1000);
    expect(inviteMs).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
  });
});

describe("consumeEmailToken", () => {
  let db: DbClient;
  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
  });

  it("returns the userId when token is valid + matching purpose + unexpired + un-consumed", async () => {
    const { token } = await issueEmailToken({ db, userId: "u1", purpose: "verify_email" });
    const r = await consumeEmailToken({ db, token, purpose: "verify_email" });
    expect(r).toEqual({ ok: true, userId: "u1" });
  });

  it("rejects an unknown token", async () => {
    const r = await consumeEmailToken({ db, token: "nope", purpose: "verify_email" });
    expect(r).toEqual({ ok: false, code: "not-found" });
  });

  it("rejects when purpose mismatches", async () => {
    const { token } = await issueEmailToken({ db, userId: "u1", purpose: "verify_email" });
    const r = await consumeEmailToken({ db, token, purpose: "reset_password" });
    expect(r).toEqual({ ok: false, code: "wrong-purpose" });
  });

  it("rejects an expired token", async () => {
    const { token } = await issueEmailToken({ db, userId: "u1", purpose: "verify_email", ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const r = await consumeEmailToken({ db, token, purpose: "verify_email" });
    expect(r).toEqual({ ok: false, code: "expired" });
  });

  it("rejects a token consumed twice (single-use guarantee)", async () => {
    const { token } = await issueEmailToken({ db, userId: "u1", purpose: "verify_email" });
    expect((await consumeEmailToken({ db, token, purpose: "verify_email" })).ok).toBe(true);
    const second = await consumeEmailToken({ db, token, purpose: "verify_email" });
    expect(second).toEqual({ ok: false, code: "already-consumed" });
  });
});

describe("pruneEmailTokens", () => {
  it("removes expired and old-consumed rows", async () => {
    const db = freshTestDb();
    await ensureSchema(db);
    const expired = await issueEmailToken({ db, userId: "u1", purpose: "verify_email", ttlMs: 1 });
    const fresh = await issueEmailToken({ db, userId: "u1", purpose: "reset_password" });
    await new Promise((r) => setTimeout(r, 5));

    const result = await pruneEmailTokens(db);
    expect(result.removed).toBe(1);

    const remaining = await db.execute("SELECT token_hash FROM user_email_tokens");
    expect(remaining.rows.length).toBe(1);
    expect(remaining.rows[0]?.token_hash).toBe(fresh.tokenHash);
    void expired;
  });
});
