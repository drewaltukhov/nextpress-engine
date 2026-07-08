import { describe, it, expect } from "vitest";
import { readEnv } from "@core/env";

/**
 * Integration test: pg boot path env validation + health-check.
 *
 * Gated by `NEXTPRESS_DB_PROVIDER === "supabase"` — skipped under the default
 * Turso CI run. Vitest config (vitest.config.ts) also excludes `*.pg.test.ts`
 * by default; setting the env var enables both routes.
 *
 * Prerequisites for this test to actually run:
 *   - NEXTPRESS_DB_PROVIDER=supabase
 *   - DATABASE_URL=postgres://nextpress_admin:<pw>@<host>:6543/postgres
 *   - DATABASE_URL_PUBLIC=postgres://nextpress_public:<pw>@<host>:6543/postgres
 *   - scripts/bootstrap-supabase-roles.sql has been applied
 *   - Migrations applied (`supabase db push` or `npm run migrate:pg`)
 */
describe.runIf(process.env.NEXTPRESS_DB_PROVIDER === "supabase")("Supabase boot path", () => {
  it("readEnv() returns provider==='supabase' when configured", () => {
    expect(readEnv().provider).toBe("supabase");
  });

  it("databaseUrlAdmin and databaseUrlPublic are populated and look like postgres URLs", () => {
    const env = readEnv();
    expect(env.databaseUrlAdmin).toMatch(/^postgres(ql)?:\/\//);
    expect(env.databaseUrlPublic).toMatch(/^postgres(ql)?:\/\//);
  });

  it("dbAdmin() connects successfully and executes a trivial query", async () => {
    const { dbAdmin } = await import("@core/db/instance");
    const { sql } = await import("drizzle-orm");
    const admin = await dbAdmin();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await (admin as any).execute(sql`SELECT 1 AS hc`);
    expect(res).toBeDefined();
  });

  it("dbPublic() connects successfully and reads from the plugins_public view", async () => {
    const { dbPublic } = await import("@core/db/instance");
    const { pluginsPublic } = await import("@core/db/schema-pg");
    const pub = await dbPublic();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = await (pub as any).select().from(pluginsPublic);
    expect(Array.isArray(rows)).toBe(true);
  });
});
