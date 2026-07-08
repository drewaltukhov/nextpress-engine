import { describe, it, expect } from "vitest";

/**
 * Boundary test: the `nextpress_public` Postgres role's grants are the
 * runtime wall protecting PII / drafts / internal tables from a misbehaving
 * caller (or third-party plugin code) that uses `dbPublic()` for the wrong
 * thing.
 *
 * Gated by `NEXTPRESS_DB_PROVIDER === "supabase"` — see pg-mode.pg.test.ts
 * for full prerequisites.
 */
describe.runIf(process.env.NEXTPRESS_DB_PROVIDER === "supabase")(
  "nextpress_public role boundary",
  () => {
    it("dbPublic() CAN read plugins_public view", async () => {
      const { dbPublic } = await import("@core/db/instance");
      const { pluginsPublic } = await import("@core/db/schema-pg");
      const pub = await dbPublic();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await expect((pub as any).select().from(pluginsPublic)).resolves.toBeInstanceOf(Array);
    });

    it("dbPublic() CANNOT read plugins (raw table) — permission denied", async () => {
      const { dbPublic } = await import("@core/db/instance");
      const { plugins } = await import("@core/db/schema-pg");
      const pub = await dbPublic();
      // Drizzle wraps the pg error as `DrizzleError("Failed query: ...")` with
      // the underlying `permission denied` on `.cause.message`. Assert both:
      // the wrapper SHAPE (the query was attempted) and the cause's text.
      let caught: unknown;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (pub as any).select().from(plugins);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      const causeMsg =
        (caught as { cause?: { message?: string } })?.cause?.message ??
        (caught as { message?: string })?.message ??
        "";
      expect(causeMsg).toMatch(/permission denied|insufficient privilege/i);
    });

    it("dbPublic() CANNOT read users (table-not-found OR permission denied — both prove the wall)", async () => {
      const { dbPublic } = await import("@core/db/instance");
      const { sql } = await import("drizzle-orm");
      const pub = await dbPublic();
      let caught: unknown;
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (pub as any).execute(sql`SELECT 1 FROM users LIMIT 1`);
      } catch (err) {
        caught = err;
      }
      expect(caught).toBeDefined();
      const causeMsg =
        (caught as { cause?: { message?: string } })?.cause?.message ??
        (caught as { message?: string })?.message ??
        "";
      // The users table may not exist yet in the pg schema-pg tree (Phase 2
      // territory), so we expect EITHER "relation does not exist" OR
      // "permission denied". Either outcome proves the public role can't
      // freely read arbitrary tables.
      expect(causeMsg).toMatch(/permission denied|relation .* does not exist|insufficient privilege/i);
    });
  }
);
