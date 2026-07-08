import { describe, it, expect, beforeEach, vi } from "vitest";
import { freshTestDb } from "../../helpers/test-db";
import type { DbClient } from "@core/db/client";

vi.mock("@generated/plugins", () => ({
  discoveredPlugins: [],
}));

import { createCustomTemplate } from "@core-plugins/themes/service";
import { getSetting, setSetting, _resetRegistry } from "@core-plugins/settings/registry";

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

async function seedBuiltIn(db: DbClient, themeSlug: string, templateName: string) {
  await db.execute({
    sql: `INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (?, 'template', ?, ?)`,
    args: [themeSlug, templateName, JSON.stringify({ content: [], root: {}, zones: {} })],
  });
}

const THEME = "nextpresso";

describe("settings copy-on-clone", () => {
  let db: DbClient;

  beforeEach(async () => {
    _resetRegistry();
    db = freshTestDb();
    await ensureSchema(db);
    await seedBuiltIn(db, THEME, "single-page");

    await setSetting(db, `theme.${THEME}.template.single-page.column_preset`, "1/3-1/3-1/3", {});
    await setSetting(db, `theme.${THEME}.template.single-page.show_left_sidebar`, true, {});
  });

  it("cloned custom inherits parent's current values at creation time", async () => {
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Cloned",
    });

    const colPreset = await getSetting<string>(db, `theme.${THEME}.template.cloned.column_preset`);
    const showLeft = await getSetting<boolean>(db, `theme.${THEME}.template.cloned.show_left_sidebar`);

    expect(colPreset).toBe("1/3-1/3-1/3");
    expect(showLeft).toBe(true);
  });

  it("mutating the custom does NOT affect the parent", async () => {
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Cloned",
    });

    await setSetting(db, `theme.${THEME}.template.cloned.column_preset`, "1/4-1/2-1/4", {});

    const parentPreset = await getSetting<string>(db, `theme.${THEME}.template.single-page.column_preset`);
    expect(parentPreset).toBe("1/3-1/3-1/3");
  });

  it("mutating the parent AFTER clone does NOT affect the custom (copy-on-clone, not live-inherit)", async () => {
    await createCustomTemplate(db, {
      themeSlug: THEME,
      parentTemplate: "single-page",
      displayName: "Cloned",
    });

    await setSetting(db, `theme.${THEME}.template.single-page.column_preset`, "1/4-1/2-1/4", {});

    const customPreset = await getSetting<string>(db, `theme.${THEME}.template.cloned.column_preset`);
    expect(customPreset).toBe("1/3-1/3-1/3");
  });
});
