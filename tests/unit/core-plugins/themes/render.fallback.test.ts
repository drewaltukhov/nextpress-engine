import { describe, it, expect, beforeEach, vi } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import type { DbClient } from "@core/db/client";

// `resolveTemplateData` lives in service.ts (pure helper, kept out of the
// render.tsx import graph so tests don't have to mock half the engine). It
// is also re-exported from render.tsx for callers that reach for it there.
vi.mock("@generated/plugins", () => ({
  discoveredPlugins: [],
}));

import { resolveTemplateData, createCustomTemplate } from "@core-plugins/themes/service";

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS theme_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_slug TEXT NOT NULL, kind TEXT NOT NULL, name TEXT NOT NULL,
      puck_data TEXT NOT NULL, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT, parent_template TEXT, display_name TEXT
    )
  `);
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS theme_data_slug_kind_name_unique ON theme_data(theme_slug, kind, name)`,
  );
  await db.execute(`
    CREATE TABLE IF NOT EXISTS site_settings (
      tenant_id INTEGER NOT NULL DEFAULT 1, key TEXT NOT NULL,
      value TEXT NOT NULL, autoload INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'private', encrypted INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, key)
    )
  `);
}

const THEME = "nextpresso";

describe("resolveTemplateData", () => {
  let db: DbClient;

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    // Seed parent row with distinctive content
    await db.execute({
      sql: `INSERT INTO theme_data (theme_slug, kind, name, puck_data) VALUES (?, 'template', 'single-page', ?)`,
      args: [THEME, JSON.stringify({ content: [{ type: "Text", props: { text: "parent" } }], root: {}, zones: {} })],
    });
  });

  it("returns the direct row for a known built-in template id", async () => {
    const result = await resolveTemplateData(db, THEME, "single-page");
    expect(result.effectiveId).toBe("single-page");
    expect(result.row.name).toBe("single-page");
    expect(result.row.kind).toBe("template");
  });

  it("returns the direct row for a custom template that has its own data", async () => {
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });

    const result = await resolveTemplateData(db, THEME, "product-page");
    expect(result.effectiveId).toBe("product-page");
    expect(result.row.name).toBe("product-page");
  });

  it("returns an empty template row for an unknown id with no parent (defensive — no throw)", async () => {
    const result = await resolveTemplateData(db, THEME, "completely-unknown");
    expect(result.effectiveId).toBe("completely-unknown");
    expect(result.row.name).toBe("completely-unknown");
    expect(result.row.puckData).toEqual({ content: [], root: {}, zones: {} });
  });
});
