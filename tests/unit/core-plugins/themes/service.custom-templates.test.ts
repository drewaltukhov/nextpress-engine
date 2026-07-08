import { describe, it, expect, beforeEach, vi } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import type { DbClient } from "@core/db/client";

// Service.ts imports @generated/plugins, which transitively loads next-auth.
// Stub it to keep this test focused on the custom-template helpers.
vi.mock("@generated/plugins", () => ({
  discoveredPlugins: [],
}));

import {
  listTemplates,
  createCustomTemplate,
  renameCustomTemplate,
  deleteCustomTemplate,
  getParentTemplate,
  deriveCustomTemplateSlug,
} from "@core-plugins/themes/service";

// ─── Schema helpers ──────────────────────────────────────────────────────────
// We set up the minimal schema the service depends on: theme_data and
// site_settings. In the real app, migrations handle this; in tests we
// create it inline.

async function ensureSchema(db: DbClient) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS theme_data (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      theme_slug TEXT NOT NULL,
      kind TEXT NOT NULL,
      name TEXT NOT NULL,
      puck_data TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_by TEXT,
      parent_template TEXT,
      display_name TEXT
    )
  `);
  await db.execute(
    `CREATE UNIQUE INDEX IF NOT EXISTS theme_data_slug_kind_name_unique ON theme_data(theme_slug, kind, name)`,
  );
  await db.execute(
    `CREATE INDEX IF NOT EXISTS theme_data_theme_parent_idx ON theme_data(theme_slug, parent_template)`,
  );
  await db.execute(`
    CREATE TABLE IF NOT EXISTS site_settings (
      tenant_id INTEGER NOT NULL DEFAULT 1,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      autoload INTEGER NOT NULL DEFAULT 0,
      scope TEXT NOT NULL DEFAULT 'private',
      encrypted INTEGER NOT NULL DEFAULT 0,
      updated_by TEXT,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (tenant_id, key)
    )
  `);
}

async function seedBuiltIn(db: DbClient, themeSlug: string, templateName: string) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (?, 'template', ?, ?)`,
    args: [themeSlug, templateName, JSON.stringify({ content: [], root: {}, zones: {} })],
  });
}

async function seedSetting(db: DbClient, key: string, value: string) {
  await db.execute({
    sql: `INSERT OR REPLACE INTO site_settings (tenant_id, key, value, scope) VALUES (1, ?, ?, 'public')`,
    args: [key, value],
  });
}

// ─── deriveCustomTemplateSlug ─────────────────────────────────────────────────

describe("deriveCustomTemplateSlug", () => {
  it("lowercases and kebab-cases the display name", () => {
    expect(deriveCustomTemplateSlug("Product Page")).toBe("product-page");
  });

  it("strips leading and trailing hyphens", () => {
    expect(deriveCustomTemplateSlug("--Hello World--")).toBe("hello-world");
  });

  it("collapses multiple separators to one hyphen", () => {
    expect(deriveCustomTemplateSlug("Hello   World!!! Test")).toBe("hello-world-test");
  });

  it("truncates at 48 characters", () => {
    const long = "a".repeat(60);
    expect(deriveCustomTemplateSlug(long)).toHaveLength(48);
  });

  it("returns empty string for unicode-only input (no latin letters/digits)", () => {
    expect(deriveCustomTemplateSlug("🚀🔥")).toBe("");
  });

  it("preserves digits", () => {
    expect(deriveCustomTemplateSlug("Version 2 Layout")).toBe("version-2-layout");
  });
});

// ─── createCustomTemplate ─────────────────────────────────────────────────────

describe("createCustomTemplate", () => {
  let db: DbClient;
  const THEME = "nextpresso";

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedBuiltIn(db, THEME, "single-page");
    await seedSetting(db, `theme.${THEME}.template.single-page.column_preset`, '"1/4-1/2-1/4"');
  });

  it("inserts a new theme_data row with correct parent_template and display_name", async () => {
    const result = await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Should be ok");
    expect(result.slug).toBe("product-page");

    const rows = await db.execute({
      sql: `SELECT name, parent_template, display_name FROM theme_data WHERE theme_slug = ? AND kind = 'template' AND parent_template IS NOT NULL`,
      args: [THEME],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].name).toBe("product-page");
    expect(rows.rows[0].parent_template).toBe("single-page");
    expect(rows.rows[0].display_name).toBe("Product Page");
  });

  it("seeds the parent's setting values into the custom's keyspace", async () => {
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });

    const setting = await db.execute({
      sql: `SELECT value FROM site_settings WHERE key = ?`,
      args: [`theme.${THEME}.template.product-page.column_preset`],
    });
    expect(setting.rows).toHaveLength(1);
    expect(setting.rows[0].value).toBe('"1/4-1/2-1/4"');
  });

  it("copies the parent's puck_data (deep clone) to the new row", async () => {
    const parentData = JSON.stringify({ content: [{ type: "Text", props: { id: "abc" } }], root: {}, zones: {} });
    await db.execute({
      sql: `UPDATE theme_data SET puck_data = ? WHERE theme_slug = ? AND kind = 'template' AND name = 'single-page'`,
      args: [parentData, THEME],
    });

    const result = await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Clone Test",
    });
    expect(result.ok).toBe(true);

    const customRow = await db.execute({
      sql: `SELECT puck_data FROM theme_data WHERE theme_slug = ? AND kind = 'template' AND name = 'clone-test'`,
      args: [THEME],
    });
    expect(customRow.rows).toHaveLength(1);
    expect(JSON.parse(String(customRow.rows[0].puck_data))).toEqual(JSON.parse(parentData));
  });

  it("rejects a displayName that normalizes to a reserved TEMPLATE_IDS value", async () => {
    const result = await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Homepage",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should not be ok");
    expect(result.error).toMatch(/built-in/i);
  });

  it("rejects an empty display name (normalizes to empty string)", async () => {
    const result = await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "!!!",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should not be ok");
    expect(result.error).toMatch(/letter or digit/i);
  });

  it("rejects parentTemplate that is not in CLONEABLE_TEMPLATE_IDS", async () => {
    const result = await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "homepage" as "single-page", // force invalid
      displayName: "My Homepage Clone",
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("Should not be ok");
    expect(result.error).toMatch(/cloneable/i);
  });

  it("deduplicates slugs with numeric suffix within the same (themeSlug, parentTemplate) scope", async () => {
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });
    const second = await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });
    expect(second.ok).toBe(true);
    if (!second.ok) throw new Error("Should be ok");
    expect(second.slug).toBe("product-page-2");
  });
});

// ─── renameCustomTemplate ─────────────────────────────────────────────────────

describe("renameCustomTemplate", () => {
  let db: DbClient;
  const THEME = "nextpresso";

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedBuiltIn(db, THEME, "single-page");
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Old Name",
    });
  });

  it("updates display_name but leaves name (slug) unchanged", async () => {
    const result = await renameCustomTemplate(db, {
      themeSlug: THEME,
      slug: "old-name",
      displayName: "New Name",
    });
    expect(result.ok).toBe(true);

    const rows = await db.execute({
      sql: `SELECT name, display_name FROM theme_data WHERE theme_slug = ? AND name = 'old-name'`,
      args: [THEME],
    });
    expect(rows.rows).toHaveLength(1);
    expect(rows.rows[0].name).toBe("old-name");
    expect(rows.rows[0].display_name).toBe("New Name");
  });

  it("returns ok: false for a non-existent slug", async () => {
    const result = await renameCustomTemplate(db, {
      themeSlug: THEME,
      slug: "does-not-exist",
      displayName: "Whatever",
    });
    expect(result.ok).toBe(false);
  });
});

// ─── deleteCustomTemplate ─────────────────────────────────────────────────────

describe("deleteCustomTemplate", () => {
  let db: DbClient;
  const THEME = "nextpresso";

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedBuiltIn(db, THEME, "single-page");
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Doomed Page",
    });
    for (const field of ["column_preset", "show_left_sidebar"]) {
      await seedSetting(
        db,
        `theme.${THEME}.template.doomed-page.${field}`,
        '"some-value"',
      );
    }
    await seedSetting(db, `theme.${THEME}.template.single-page.column_preset`, '"1/3-1/3-1/3"');
  });

  it("removes the theme_data row", async () => {
    await deleteCustomTemplate(db, { themeSlug: THEME, slug: "doomed-page" });
    const rows = await db.execute({
      sql: `SELECT id FROM theme_data WHERE theme_slug = ? AND name = 'doomed-page'`,
      args: [THEME],
    });
    expect(rows.rows).toHaveLength(0);
  });

  it("cascade-deletes all site_settings rows matching theme.<slug>.template.<custom-slug>.%", async () => {
    await deleteCustomTemplate(db, { themeSlug: THEME, slug: "doomed-page" });
    const remaining = await db.execute({
      sql: `SELECT key FROM site_settings WHERE key LIKE ?`,
      args: [`theme.${THEME}.template.doomed-page.%`],
    });
    expect(remaining.rows).toHaveLength(0);
  });

  it("leaves the parent's settings intact", async () => {
    await deleteCustomTemplate(db, { themeSlug: THEME, slug: "doomed-page" });
    const parentSettings = await db.execute({
      sql: `SELECT key FROM site_settings WHERE key LIKE ?`,
      args: [`theme.${THEME}.template.single-page.%`],
    });
    expect(parentSettings.rows.length).toBeGreaterThan(0);
  });
});

// ─── listTemplates ────────────────────────────────────────────────────────────

describe("listTemplates", () => {
  let db: DbClient;
  const THEME = "nextpresso";

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedBuiltIn(db, THEME, "single-page");
    await seedBuiltIn(db, THEME, "single-post");
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-post",
      displayName: "Long Form",
    });
  });

  it("returns customs grouped by parent", async () => {
    const { customsByParent } = await listTemplates(db, THEME);
    expect(customsByParent["single-page"]).toHaveLength(1);
    expect(customsByParent["single-page"][0].slug).toBe("product-page");
    expect(customsByParent["single-post"]).toHaveLength(1);
    expect(customsByParent["single-post"][0].slug).toBe("long-form");
  });
});

// ─── getParentTemplate ────────────────────────────────────────────────────────

describe("getParentTemplate", () => {
  let db: DbClient;
  const THEME = "nextpresso";

  beforeEach(async () => {
    db = freshTestDb();
    await ensureSchema(db);
    await seedBuiltIn(db, THEME, "single-page");
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Product Page",
    });
  });

  it("returns the parent id for a custom template", async () => {
    const parent = await getParentTemplate(db, THEME, "product-page");
    expect(parent).toBe("single-page");
  });

  it("returns null for a built-in template name", async () => {
    const parent = await getParentTemplate(db, THEME, "single-page");
    expect(parent).toBeNull();
  });

  it("returns null for an unknown template name", async () => {
    const parent = await getParentTemplate(db, THEME, "does-not-exist");
    expect(parent).toBeNull();
  });
});
