import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import { reserveSlug } from "@core/slugs/registry";
import { validateSlug } from "@core/slugs/validate";
import type { DbClient } from "@core/db/client";

async function ensureTable(db: DbClient) {
  await db.execute(`
    CREATE TABLE reserved_slugs (
      slug TEXT NOT NULL, tenant_id INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL, reason TEXT NOT NULL, added_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, slug)
    )
  `);
}

describe("validateSlug", () => {
  let db: DbClient;
  beforeEach(async () => {
    db = freshTestDb();
    await ensureTable(db);
    await reserveSlug(db, { slug: "admin", reason: "core", source: "core" });
  });

  it("rejects a top-level slug that collides with a kernel reservation", async () => {
    const result = await validateSlug(db, { slug: "admin", effectivePath: "/admin" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.code).toBe("reserved");
      expect(result.message).toMatch(/reserved/i);
    }
  });

  it("accepts a non-top-level path that contains a reserved word", async () => {
    const result = await validateSlug(db, { slug: "admin", effectivePath: "/posts/admin" });
    expect(result.ok).toBe(true);
  });

  it("accepts a non-reserved top-level slug", async () => {
    const result = await validateSlug(db, { slug: "about-us", effectivePath: "/about-us" });
    expect(result.ok).toBe(true);
  });

  it("rejects an empty slug", async () => {
    const result = await validateSlug(db, { slug: "", effectivePath: "/" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("empty");
  });

  it("normalizes the slug before checking", async () => {
    const result = await validateSlug(db, { slug: "ADMIN", effectivePath: "/admin" });
    expect(result.ok).toBe(false);
  });
});
