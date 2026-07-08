/**
 * One-shot dev seed: creates an admin user with credentials so the login
 * feature can be tested locally.
 *
 *   email:    admin@nextpress.local   (override: SEED_ADMIN_EMAIL)
 *   password: admin                   (override: SEED_ADMIN_PASSWORD)
 *
 * Idempotent — re-running upserts the user, refreshes the password hash,
 * and re-assigns the admin role. Bypasses the zxcvbn strength gate
 * because this is dev seed data, not user input.
 *
 * Run: npm run seed:admin
 */
import { randomUUID } from "node:crypto";
import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import { hashPassword } from "../src/core-plugins/users/passwords";

const SEED_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@nextpress.local";
const SEED_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "admin";
const SEED_DISPLAY_NAME = process.env.SEED_ADMIN_DISPLAY_NAME ?? "Admin";
const TENANT_ID = 1;

async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });

  // Look up the existing user by (tenant, email) — we want a stable id across reruns.
  const existing = await db.execute({
    sql: "SELECT id FROM users WHERE tenant_id = ? AND email = ? LIMIT 1",
    args: [TENANT_ID, SEED_EMAIL]
  });
  const userId = String(existing.rows[0]?.id ?? randomUUID());

  // Insert or update — split into two statements because the (tenant_id, email)
  // uniqueness is enforced by a *partial* index (WHERE deleted_at IS NULL,
  // migration users/003) that SQLite's ON CONFLICT clause cannot target.
  const nowIso = new Date().toISOString();
  if (existing.rows[0]?.id) {
    await db.execute({
      sql: `UPDATE users
            SET email_verified_at = ?, display_name = ?, status = 'active', updated_at = ?
            WHERE id = ?`,
      args: [nowIso, SEED_DISPLAY_NAME, nowIso, userId]
    });
  } else {
    await db.execute({
      sql: `INSERT INTO users (id, tenant_id, email, email_verified_at, display_name, status, updated_at)
            VALUES (?, ?, ?, ?, ?, 'active', ?)`,
      args: [userId, TENANT_ID, SEED_EMAIL, nowIso, SEED_DISPLAY_NAME, nowIso]
    });
  }

  // Hash the password (raw — strength gate is for user-input writes, not seeds).
  const passwordHash = await hashPassword(SEED_PASSWORD);
  await db.execute({
    sql: `INSERT INTO user_credentials (user_id, password_hash, algo, must_reset, updated_at)
          VALUES (?, ?, 'argon2id', 0, ?)
          ON CONFLICT(user_id) DO UPDATE
            SET password_hash = excluded.password_hash,
                algo = excluded.algo,
                must_reset = 0,
                updated_at = excluded.updated_at`,
    args: [userId, passwordHash, nowIso]
  });

  // Assign the admin role.
  await db.execute({
    sql: `INSERT INTO user_roles (user_id, role_slug, tenant_id)
          VALUES (?, 'admin', ?)
          ON CONFLICT(user_id, role_slug, tenant_id) DO NOTHING`,
    args: [userId, TENANT_ID]
  });

  // Flip the setup-complete flag so seeded environments don't fall through to
  // the first-run setup wizard. The row is JSON-encoded ('true'/'false');
  // upsert to cover the case where the settings seed migration hasn't landed yet.
  await db.execute({
    sql: `INSERT INTO site_settings (tenant_id, key, value, autoload, scope, encrypted)
          VALUES (?, 'system.setup_complete', 'true', 1, 'private', 0)
          ON CONFLICT(tenant_id, key) DO UPDATE SET value = 'true'`,
    args: [TENANT_ID]
  });

  console.log("[seed:admin] OK");
  console.log(`  user id:  ${userId}`);
  console.log(`  email:    ${SEED_EMAIL}`);
  console.log(`  password: ${SEED_PASSWORD}`);
  console.log(`  role:     admin`);
}

main().catch((err) => {
  console.error("[seed:admin] FAILED:", err);
  process.exit(1);
});
