/**
 * Themes service — discovery + activation + Puck-data CRUD.
 *
 * Available themes are discovered from `themes/<slug>/` at boot via the
 * shared plugin discovery script (manifest.type === "theme"). The list
 * here pulls from `discoveredPlugins` so admin UI sees every shipped
 * theme, even ones that are inactive.
 *
 * Active theme is one row in the existing settings table:
 *   key: 'theme.active_slug', value: '<slug>' or null.
 *
 * Per-theme Puck data lives in `theme_data` keyed by (theme_slug, kind,
 * name). Each theme's own migration seeds defaults; the builder
 * UPDATEs in place.
 */
import { unstable_cache, updateTag } from "next/cache";
import type { DbClient } from "@core/db/client";
import { cacheOrFallback } from "@core/caching/with-fallback";
import { discoveredPlugins } from "@generated/plugins";

function getRuntimeDb(): DbClient {
  const fn = (globalThis as unknown as Record<string, (() => DbClient) | undefined>)["__nextpress_db_accessor__"];
  if (!fn) throw new Error("DB accessor not initialised — boot hasn't run");
  return fn();
}
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import type { ThemeDataKind } from "./schema/themes";
import { getThemeDefaults } from "./defaults-registry";
import {
  CLONEABLE_TEMPLATE_IDS,
  TEMPLATE_IDS,
  TEMPLATE_SETTING_FIELDS,
  type CloneableTemplateId,
} from "./templates";

const ACTIVE_SLUG_KEY = "theme.active_slug";

export interface ThemeListItem {
  slug: string;
  name: string;
  version: string;
  /** Pulled from `manifest.author` if present (free-form). null when the
   *  manifest doesn't include one. */
  author: string | null;
  /** Convention-based public URL for the theme's cover image. The image
   *  itself ships at `themes/<slug>/cover.png` and is served by the
   *  `/api/themes/[slug]/[...path]` route. Always set; if the file
   *  doesn't exist on disk the URL 404s and the admin UI falls back to a
   *  gradient placeholder via `onError`. */
  coverUrl: string;
  active: boolean;
}

export interface ThemeDataValue {
  themeSlug: string;
  kind: ThemeDataKind;
  name: string;
  /** Parsed Puck Data JSON (the block tree). */
  puckData: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

/**
 * In-memory list of themes discovered on disk. Pulled from the plugin
 * discovery output; each entry is a manifest row whose type === "theme".
 */
function discoveredThemes(): { slug: string; name: string; version: string; author: string | null }[] {
  return discoveredPlugins
    .filter((p) => p.manifest.type === "theme")
    .map((p) => {
      // The manifest schema doesn't (today) have an `author` field; we
      // read it tolerantly off the raw manifest object so themes can ship
      // it in their plugin.json without us needing to widen the schema.
      const m = p.manifest as Record<string, unknown> & { slug: string; name: string; version: string };
      const authorVal = m.author;
      return {
        slug: m.slug,
        name: m.name,
        version: m.version,
        author: typeof authorVal === "string" ? authorVal : null,
      };
    });
}

export async function getActiveThemeSlug(db: DbClient): Promise<string | null> {
  const v = await getSetting<string>(db, ACTIVE_SLUG_KEY);
  return v && v.length > 0 ? v : null;
}

export async function setActiveThemeSlug(
  db: DbClient,
  slug: string | null,
  opts?: { updatedBy?: string },
): Promise<void> {
  await setSetting(db, ACTIVE_SLUG_KEY, slug, opts ?? {});
}

function coverUrlFor(slug: string): string {
  return `/api/themes/${slug}/cover.png`;
}

export async function listThemes(db: DbClient): Promise<ThemeListItem[]> {
  const active = await getActiveThemeSlug(db);
  return discoveredThemes().map((t) => ({
    ...t,
    coverUrl: coverUrlFor(t.slug),
    active: active === t.slug,
  }));
}

export async function getThemeListItem(
  db: DbClient,
  slug: string,
): Promise<ThemeListItem | null> {
  const active = await getActiveThemeSlug(db);
  const t = discoveredThemes().find((x) => x.slug === slug);
  return t
    ? { ...t, coverUrl: coverUrlFor(t.slug), active: active === t.slug }
    : null;
}

// ─── Per-theme Puck data ───────────────────────────────────────────────────

// ─── Process-scoped bulk cache for theme_data (perf optimization) ─────────
// Each page render reads ~13-19 (kind, name) combos for the active theme.
// Bulk-load every row for the slug on first miss + memo with TTL — invalidated
// on `setThemeData` / `deleteThemeData` writes.
//
// Two layers:
//   1. Process-scoped Map (`themeDataBulkMap`) — zero per-call overhead once
//      filled. TTL is long because writes call `invalidateThemeDataCache`.
//   2. Next.js data cache (`unstable_cache`) — survives across Turbopack
//      worker boundaries and serverless cold starts. Invalidated by
//      `revalidateTag(themeTag(slug))` from admin write actions.
const THEME_DATA_BULK_KEY = "__nextpress_theme_data_bulk__" as const;
const THEME_DATA_BULK_AT_KEY = "__nextpress_theme_data_bulk_at__" as const;
const THEME_DATA_INFLIGHT_KEY = "__nextpress_theme_data_inflight__" as const;
const THEME_DATA_TTL_MS = 5 * 60_000;

type ThemeDataBulkMap = Map<string, Map<string, ThemeDataValue>>; // slug -> "kind:name" -> value

export function themeTag(slug: string): string {
  return `nextpress:theme:${slug}`;
}

function themeDataBulkMap(): ThemeDataBulkMap {
  const g = globalThis as unknown as Record<string, ThemeDataBulkMap | undefined>;
  if (!g[THEME_DATA_BULK_KEY]) g[THEME_DATA_BULK_KEY] = new Map();
  return g[THEME_DATA_BULK_KEY]!;
}
function themeDataBulkAge(slug: string): number {
  const g = globalThis as unknown as Record<string, Record<string, number> | undefined>;
  return Date.now() - (g[THEME_DATA_BULK_AT_KEY]?.[slug] ?? 0);
}
function markThemeDataBulkAt(slug: string): void {
  const g = globalThis as unknown as Record<string, Record<string, number>>;
  if (!g[THEME_DATA_BULK_AT_KEY]) g[THEME_DATA_BULK_AT_KEY] = {};
  g[THEME_DATA_BULK_AT_KEY][slug] = Date.now();
}
function themeDataInflight(slug: string): Promise<Map<string, ThemeDataValue>> | null {
  const g = globalThis as unknown as Record<string, Record<string, Promise<Map<string, ThemeDataValue>>> | undefined>;
  return g[THEME_DATA_INFLIGHT_KEY]?.[slug] ?? null;
}
function setThemeDataInflight(slug: string, p: Promise<Map<string, ThemeDataValue>> | null): void {
  const g = globalThis as unknown as Record<string, Record<string, Promise<Map<string, ThemeDataValue>> | undefined>>;
  if (!g[THEME_DATA_INFLIGHT_KEY]) g[THEME_DATA_INFLIGHT_KEY] = {};
  if (p) g[THEME_DATA_INFLIGHT_KEY][slug] = p;
  else delete g[THEME_DATA_INFLIGHT_KEY][slug];
}

export function invalidateThemeDataCache(themeSlug?: string): void {
  if (themeSlug) {
    themeDataBulkMap().delete(themeSlug);
    const g = globalThis as unknown as Record<string, Record<string, number>>;
    if (g[THEME_DATA_BULK_AT_KEY]) delete g[THEME_DATA_BULK_AT_KEY][themeSlug];
    setThemeDataInflight(themeSlug, null);
  } else {
    themeDataBulkMap().clear();
    (globalThis as unknown as Record<string, Record<string, number> | undefined>)[THEME_DATA_BULK_AT_KEY] = {};
    (globalThis as unknown as Record<string, Record<string, Promise<Map<string, ThemeDataValue>>> | undefined>)[THEME_DATA_INFLIGHT_KEY] = {};
  }
  try {
    updateTag("nextpress:theme");
  } catch {
    // non-Server-Action context — in-process clear is enough
  }
}

async function listThemeDataRaw(
  db: DbClient,
  themeSlug: string,
): Promise<ThemeDataValue[]> {
  const r = await db.execute({
    sql: `SELECT theme_slug, kind, name, puck_data, updated_at, updated_by
            FROM theme_data
           WHERE theme_slug = ?
        ORDER BY kind, name`,
    args: [themeSlug],
  });
  return r.rows.map((row): ThemeDataValue => {
    let parsed: unknown = null;
    try {
      parsed = JSON.parse(String(row.puck_data));
    } catch {
      parsed = null;
    }
    return {
      themeSlug: String(row.theme_slug),
      kind: String(row.kind) as ThemeDataKind,
      name: String(row.name),
      puckData: parsed,
      updatedAt: String(row.updated_at),
      updatedBy: row.updated_by != null ? String(row.updated_by) : null,
    };
  });
}

const loadThemeDataCached = unstable_cache(
  (themeSlug: string): Promise<ThemeDataValue[]> => listThemeDataRaw(getRuntimeDb(), themeSlug),
  ["nextpress", "theme-data-bulk", "v1"],
  { tags: ["nextpress:theme"], revalidate: 300 },
);

async function ensureThemeDataBulk(db: DbClient, themeSlug: string): Promise<Map<string, ThemeDataValue>> {
  const existing = themeDataBulkMap().get(themeSlug);
  if (existing && themeDataBulkAge(themeSlug) < THEME_DATA_TTL_MS) return existing;
  let p = themeDataInflight(themeSlug);
  if (!p) {
    p = (async () => {
      const list = await cacheOrFallback(
        () => loadThemeDataCached(themeSlug),
        () => listThemeDataRaw(db, themeSlug),
      );
      const map = new Map<string, ThemeDataValue>();
      for (const v of list) map.set(`${v.kind}:${v.name}`, v);
      themeDataBulkMap().set(themeSlug, map);
      markThemeDataBulkAt(themeSlug);
      return map;
    })().finally(() => setThemeDataInflight(themeSlug, null));
    setThemeDataInflight(themeSlug, p);
  }
  return p;
}

export async function getThemeData(
  db: DbClient,
  themeSlug: string,
  kind: ThemeDataKind,
  name: string,
): Promise<ThemeDataValue | null> {
  const bulk = await ensureThemeDataBulk(db, themeSlug);
  return bulk.get(`${kind}:${name}`) ?? null;
}

export async function listThemeData(
  db: DbClient,
  themeSlug: string,
): Promise<ThemeDataValue[]> {
  // Routes through the same cache the public site uses. Theme writes
  // (`setThemeData`, `createCustomTemplate`, etc.) call
  // `invalidateThemeDataCache(slug)` → `updateTag('nextpress:theme')`,
  // so reads from the builder land on fresh data after every save.
  return cacheOrFallback(
    () => loadThemeDataCached(themeSlug),
    () => listThemeDataRaw(db, themeSlug),
  );
}

export async function setThemeData(
  db: DbClient,
  themeSlug: string,
  kind: ThemeDataKind,
  name: string,
  puckData: unknown,
  opts?: { updatedBy?: string },
): Promise<void> {
  const json = JSON.stringify(puckData ?? null);
  await db.execute({
    sql: `INSERT INTO theme_data (theme_slug, kind, name, puck_data, updated_by)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT (theme_slug, kind, name) DO UPDATE SET
            puck_data = excluded.puck_data,
            updated_by = excluded.updated_by,
            updated_at = CURRENT_TIMESTAMP`,
    args: [themeSlug, kind, name, json, opts?.updatedBy ?? null],
  });
  invalidateThemeDataCache(themeSlug);
}

export async function resetThemeData(
  db: DbClient,
  themeSlug: string,
  kind: ThemeDataKind,
  name: string,
): Promise<void> {
  await db.execute({
    sql: `DELETE FROM theme_data WHERE theme_slug = ? AND kind = ? AND name = ?`,
    args: [themeSlug, kind, name],
  });
  invalidateThemeDataCache(themeSlug);
}

export interface ApplyDefaultsResult {
  written: { kind: ThemeDataKind; name: string }[];
  skipped: { kind: ThemeDataKind; name: string }[];
}

/**
 * Apply a theme's registered defaults to its `theme_data` rows. Used by
 * activation (only-missing-or-empty) and the builder's Reset button
 * (force-overwrite, single row at a time).
 *
 * Returns which rows were written and which were skipped (because the
 * existing row already has content and onlyMissingOrEmpty=true).
 */
export async function applyThemeDefaults(
  db: DbClient,
  slug: string,
  opts: { onlyMissingOrEmpty?: boolean; updatedBy?: string } = {},
): Promise<ApplyDefaultsResult> {
  const defaults = getThemeDefaults(slug);
  if (!defaults) return { written: [], skipped: [] };

  const onlyMissingOrEmpty = opts.onlyMissingOrEmpty ?? true;

  const written: { kind: ThemeDataKind; name: string }[] = [];
  const skipped: { kind: ThemeDataKind; name: string }[] = [];

  const seed = async (kind: ThemeDataKind, name: string, data: unknown) => {
    if (onlyMissingOrEmpty) {
      const existing = await getThemeData(db, slug, kind, name);
      const isEmpty =
        !existing ||
        !existing.puckData ||
        (typeof existing.puckData === "object" &&
          existing.puckData !== null &&
          "content" in existing.puckData &&
          Array.isArray((existing.puckData as { content: unknown[] }).content) &&
          (existing.puckData as { content: unknown[] }).content.length === 0);
      if (!isEmpty) {
        skipped.push({ kind, name });
        return;
      }
    }
    await setThemeData(db, slug, kind, name, data, { updatedBy: opts.updatedBy });
    written.push({ kind, name });
  };

  for (const [name, data] of Object.entries(defaults.parts)) {
    await seed("part", name, data);
  }
  for (const [name, data] of Object.entries(defaults.templates)) {
    await seed("template", name, data);
  }

  return { written, skipped };
}

// ─── Custom template types ────────────────────────────────────────────────────

export interface CustomTemplateRow {
  slug: string;
  displayName: string;
  parentTemplate: CloneableTemplateId;
  puckData: unknown;
  updatedAt: string;
  updatedBy: string | null;
}

export interface ListTemplatesResult {
  customsByParent: Record<string, CustomTemplateRow[]>;
}

export type CreateCustomTemplateInput = {
  themeSlug: string;
  parentTemplate: CloneableTemplateId;
  displayName: string;
};

export type CreateCustomTemplateResult =
  | { ok: true; slug: string }
  | { ok: false; error: string };

export type RenameCustomTemplateInput = {
  themeSlug: string;
  slug: string;
  displayName: string;
};

export type RenameCustomTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

export type DeleteCustomTemplateInput = {
  themeSlug: string;
  slug: string;
};

export type DeleteCustomTemplateResult =
  | { ok: true }
  | { ok: false; error: string };

// ─── deriveCustomTemplateSlug ─────────────────────────────────────────────────

/**
 * Normalize a user-entered display name into a URL-safe slug.
 * Lowercases, replaces non-alphanumeric runs with hyphens, strips
 * leading/trailing hyphens, and truncates at 48 characters.
 */
export function deriveCustomTemplateSlug(displayName: string): string {
  return displayName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// ─── listTemplates ────────────────────────────────────────────────────────────

/**
 * List all custom templates for a theme, grouped by their parent template id.
 */
async function listTemplatesRaw(
  db: DbClient,
  themeSlug: string,
): Promise<ListTemplatesResult> {
  const r = await db.execute({
    sql: `SELECT name, display_name, parent_template, puck_data, updated_at, updated_by
            FROM theme_data
           WHERE theme_slug = ? AND kind = 'template' AND parent_template IS NOT NULL
        ORDER BY parent_template, name`,
    args: [themeSlug],
  });

  const customsByParent: Record<string, CustomTemplateRow[]> = {};
  for (const row of r.rows) {
    const parent = String(row.parent_template);
    if (!customsByParent[parent]) customsByParent[parent] = [];
    let parsed: unknown = null;
    try { parsed = JSON.parse(String(row.puck_data)); } catch { parsed = null; }
    customsByParent[parent].push({
      slug: String(row.name),
      displayName: row.display_name != null ? String(row.display_name) : String(row.name),
      parentTemplate: parent as CloneableTemplateId,
      puckData: parsed,
      updatedAt: String(row.updated_at),
      updatedBy: row.updated_by != null ? String(row.updated_by) : null,
    });
  }

  return { customsByParent };
}

const listTemplatesCached = unstable_cache(
  (themeSlug: string): Promise<ListTemplatesResult> => listTemplatesRaw(getRuntimeDb(), themeSlug),
  ["nextpress", "theme-templates", "v1"],
  { tags: ["nextpress:theme"], revalidate: 300 },
);

export async function listTemplates(
  db: DbClient,
  themeSlug: string,
): Promise<ListTemplatesResult> {
  return cacheOrFallback(
    () => listTemplatesCached(themeSlug),
    () => listTemplatesRaw(db, themeSlug),
  );
}

// ─── createCustomTemplate ─────────────────────────────────────────────────────

export async function createCustomTemplate(
  db: DbClient,
  input: CreateCustomTemplateInput,
): Promise<CreateCustomTemplateResult> {
  const { themeSlug, parentTemplate, displayName } = input;

  if (!(CLONEABLE_TEMPLATE_IDS as readonly string[]).includes(parentTemplate)) {
    return {
      ok: false,
      error: `Parent template "${parentTemplate}" is not cloneable. Must be one of: ${CLONEABLE_TEMPLATE_IDS.join(", ")}.`,
    };
  }

  const baseSlug = deriveCustomTemplateSlug(displayName);

  if (baseSlug.length === 0) {
    return { ok: false, error: "Name must contain at least one letter or digit." };
  }

  if ((TEMPLATE_IDS as readonly string[]).includes(baseSlug)) {
    return {
      ok: false,
      error: `Name conflicts with a built-in template ("${baseSlug}"). Choose a different name.`,
    };
  }

  const existingR = await db.execute({
    sql: `SELECT name FROM theme_data WHERE theme_slug = ? AND kind = 'template' AND parent_template = ?`,
    args: [themeSlug, parentTemplate],
  });
  const existingSlugs = new Set(existingR.rows.map((r) => String(r.name)));

  let finalSlug = baseSlug;
  if (existingSlugs.has(finalSlug)) {
    let found = false;
    for (let i = 2; i <= 99; i++) {
      const candidate = `${baseSlug}-${i}`;
      if (!existingSlugs.has(candidate)) {
        finalSlug = candidate;
        found = true;
        break;
      }
    }
    if (!found) {
      return { ok: false, error: "Too many templates with similar names; pick a more unique name." };
    }
  }

  const parentRow = await getThemeData(db, themeSlug, "template", parentTemplate);
  const clonedPuckData = JSON.parse(
    JSON.stringify(parentRow?.puckData ?? { content: [], root: {}, zones: {} }),
  );

  await db.execute({
    sql: `INSERT INTO theme_data (theme_slug, kind, name, puck_data, parent_template, display_name) VALUES (?, 'template', ?, ?, ?, ?)`,
    args: [themeSlug, finalSlug, JSON.stringify(clonedPuckData), parentTemplate, displayName],
  });
  invalidateThemeDataCache(themeSlug);

  for (const field of TEMPLATE_SETTING_FIELDS) {
    const parentKey = `theme.${themeSlug}.template.${parentTemplate}.${field}`;
    const customKey = `theme.${themeSlug}.template.${finalSlug}.${field}`;
    const value = await getSetting(db, parentKey);
    if (value !== undefined) {
      await setSetting(db, customKey, value, {});
    }
  }

  return { ok: true, slug: finalSlug };
}

// ─── renameCustomTemplate ─────────────────────────────────────────────────────

export async function renameCustomTemplate(
  db: DbClient,
  input: RenameCustomTemplateInput,
): Promise<RenameCustomTemplateResult> {
  const { themeSlug, slug, displayName } = input;

  const existing = await db.execute({
    sql: `SELECT id FROM theme_data WHERE theme_slug = ? AND kind = 'template' AND name = ? AND parent_template IS NOT NULL`,
    args: [themeSlug, slug],
  });
  if (existing.rows.length === 0) {
    return { ok: false, error: `Custom template "${slug}" not found in theme "${themeSlug}".` };
  }

  await db.execute({
    sql: `UPDATE theme_data SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE theme_slug = ? AND kind = 'template' AND name = ?`,
    args: [displayName, themeSlug, slug],
  });
  invalidateThemeDataCache(themeSlug);

  return { ok: true };
}

// ─── deleteCustomTemplate ─────────────────────────────────────────────────────

export async function deleteCustomTemplate(
  db: DbClient,
  input: DeleteCustomTemplateInput,
): Promise<DeleteCustomTemplateResult> {
  const { themeSlug, slug } = input;

  await db.execute({
    sql: `DELETE FROM theme_data WHERE theme_slug = ? AND kind = 'template' AND name = ? AND parent_template IS NOT NULL`,
    args: [themeSlug, slug],
  });
  invalidateThemeDataCache(themeSlug);

  await db.execute({
    sql: `DELETE FROM site_settings WHERE tenant_id = 1 AND key LIKE ?`,
    args: [`theme.${themeSlug}.template.${slug}.%`],
  });

  return { ok: true };
}

// ─── resolveTemplateData ──────────────────────────────────────────────────────

/**
 * Resolve theme data for a template, with a defensive parent-fallback for
 * custom templates whose row is missing. For built-ins (which always have
 * seeded rows) this is equivalent to a direct `getThemeData` call. For
 * customs, if the direct row is gone, we fall back to the parent's row so
 * the public site renders the parent's content rather than an empty page.
 * If neither exists, we return a safe empty row so the renderer doesn't 500.
 */
export async function resolveTemplateData(
  db: DbClient,
  themeSlug: string,
  templateId: string,
): Promise<{ row: ThemeDataValue; effectiveId: string }> {
  const direct = await getThemeData(db, themeSlug, "template", templateId);
  if (direct) return { row: direct, effectiveId: templateId };

  const parent = await getParentTemplate(db, themeSlug, templateId);
  if (parent) {
    const parentRow = await getThemeData(db, themeSlug, "template", parent);
    if (parentRow) return { row: parentRow, effectiveId: parent };
  }

  const emptyRow: ThemeDataValue = {
    themeSlug,
    kind: "template",
    name: templateId,
    puckData: { content: [], root: {}, zones: {} },
    updatedAt: new Date().toISOString(),
    updatedBy: null,
  };
  return { row: emptyRow, effectiveId: templateId };
}

// ─── getParentTemplate ────────────────────────────────────────────────────────

export async function getParentTemplate(
  db: DbClient,
  themeSlug: string,
  templateName: string,
): Promise<string | null> {
  const r = await db.execute({
    sql: `SELECT parent_template FROM theme_data WHERE theme_slug = ? AND kind = 'template' AND name = ? LIMIT 1`,
    args: [themeSlug, templateName],
  });
  if (r.rows.length === 0) return null;
  const val = r.rows[0].parent_template;
  return val != null ? String(val) : null;
}

// ─── effectiveTemplateId ──────────────────────────────────────────────────────

/**
 * Pick the safe template id to render a piece of content with.
 *
 * Posts/pages/topics each store a freeform `template` slug. The admin UI
 * filters the picker by the current kind (e.g. pillar posts only show
 * single-pillar customs), so a properly-saved row's template always
 * matches the kind. This helper backstops the contract at render time:
 * if the saved template doesn't exist in the active theme, OR its
 * `parent_template` doesn't match the kind's expected parent, we fall
 * back to the built-in. This way "pillar wins" — if a post is changed
 * to kind=pillar and its old template was a single-post clone, the
 * public site still renders with the built-in `single-pillar`.
 *
 * @param expectedParent - The built-in parent the content kind expects
 *   (e.g. "single-pillar" for pillar posts, "single-post" for
 *   standalone/spike, "single-page" for pages, "topic-archive" for
 *   topic archives).
 * @param fallbackBuiltin - The built-in template id to use when the
 *   saved template is unsuitable. Typically the same as expectedParent.
 */
export async function effectiveTemplateId(
  db: DbClient,
  themeSlug: string | null | undefined,
  savedTemplate: string | null | undefined,
  expectedParent: string,
  fallbackBuiltin: string,
): Promise<string> {
  if (!savedTemplate) return fallbackBuiltin;
  if (!themeSlug) return fallbackBuiltin;
  const parent = await getParentTemplate(db, themeSlug, savedTemplate);
  if (parent === expectedParent) return savedTemplate;
  return fallbackBuiltin;
}

// ─── listActiveCustomsForParent ───────────────────────────────────────────────

/** Slim shape returned to admin UIs that just need to populate a Template
 *  dropdown — no puck_data or timestamps. */
export interface CustomTemplateOption {
  slug: string;
  displayName: string;
}

/**
 * Return the active theme's custom templates that clone a given built-in
 * parent (e.g. `"single-page"`, `"single-post"`, `"single-pillar"`,
 * `"topic-archive"`). Returns an empty array when no theme is active or
 * the active theme has no customs for that parent. Used by the admin
 * post/page/topic edit forms to populate their Template <Select>.
 */
export async function listActiveCustomsForParent(
  db: DbClient,
  parent: string,
): Promise<CustomTemplateOption[]> {
  const slug = await getActiveThemeSlug(db);
  if (!slug) return [];
  const { customsByParent } = await listTemplates(db, slug);
  return (customsByParent[parent] ?? []).map((c) => ({
    slug: c.slug,
    displayName: c.displayName,
  }));
}
