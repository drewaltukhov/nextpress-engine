import { describe, it, expect, beforeEach } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import {
  isSlugReserved,
  reserveSlug,
  releaseSlug,
  listReservations
} from "@core/slugs/registry";
import type { DbClient } from "@core/db/client";

async function ensureTable(db: DbClient) {
  await db.execute(`
    CREATE TABLE reserved_slugs (
      slug TEXT NOT NULL,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      source TEXT NOT NULL,
      reason TEXT NOT NULL,
      added_by TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, slug)
    );
  `);
}

describe("reserved slugs registry", () => {
  let db: DbClient;
  beforeEach(async () => {
    db = freshTestDb();
    await ensureTable(db);
  });

  it("reserveSlug + isSlugReserved roundtrip", async () => {
    await reserveSlug(db, { slug: "guides", reason: "Topic landings", source: "plugin:topics" });
    expect(await isSlugReserved(db, "guides")).toBe(true);
    expect(await isSlugReserved(db, "missing")).toBe(false);
  });

  it("matches case-insensitively", async () => {
    await reserveSlug(db, { slug: "Admin", reason: "engine", source: "core" });
    expect(await isSlugReserved(db, "ADMIN")).toBe(true);
    expect(await isSlugReserved(db, "admin")).toBe(true);
  });

  it("normalizes the slug on insert (lowercase + kebab)", async () => {
    await reserveSlug(db, { slug: "My Cool Path", reason: "x", source: "manual" });
    expect(await isSlugReserved(db, "my-cool-path")).toBe(true);
  });

  it("releaseSlug only removes rows from the matching source", async () => {
    await reserveSlug(db, { slug: "shared", reason: "core", source: "core" });
    await reserveSlug(db, { slug: "shared", reason: "plugin", source: "plugin:x" });
    // Same (tenant, slug) is one PK; the second reserveSlug overwrites source to 'plugin:x'.
    // releasing with 'core' must NOT remove the plugin:x-owned row.
    await releaseSlug(db, { slug: "shared", source: "core" });
    expect(await isSlugReserved(db, "shared")).toBe(true);

    await releaseSlug(db, { slug: "shared", source: "plugin:x" });
    expect(await isSlugReserved(db, "shared")).toBe(false);
  });

  it("listReservations returns all rows with stable ordering", async () => {
    await reserveSlug(db, { slug: "alpha", reason: "x", source: "core" });
    await reserveSlug(db, { slug: "bravo", reason: "y", source: "manual" });
    const list = await listReservations(db);
    expect(list.map((r) => r.slug)).toEqual(["alpha", "bravo"]);
  });

  it("supports tenant isolation", async () => {
    await reserveSlug(db, { slug: "guides", reason: "t1", source: "plugin:t", tenantId: 1 });
    await reserveSlug(db, { slug: "guides", reason: "t2", source: "plugin:t", tenantId: 2 });
    expect(await isSlugReserved(db, "guides", 1)).toBe(true);
    expect(await isSlugReserved(db, "guides", 2)).toBe(true);
    expect(await isSlugReserved(db, "guides", 3)).toBe(false);
  });
});
