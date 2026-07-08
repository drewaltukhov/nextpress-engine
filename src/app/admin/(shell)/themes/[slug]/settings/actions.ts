"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  listDefinitions,
  getSetting,
  setSetting,
} from "@core-plugins/settings/registry";
import {
  createCustomTemplate,
  renameCustomTemplate,
  deleteCustomTemplate,
  listTemplates,
  type CreateCustomTemplateResult,
  type RenameCustomTemplateResult,
  type DeleteCustomTemplateResult,
} from "@core-plugins/themes/service";
import type { CloneableTemplateId } from "@core-plugins/themes/templates";

export type SaveResult = { ok: true } | { ok: false; error: string };

// Plain shape passed to the client form. SettingDefinition holds a Zod
// schema (class instance) which RSC serialization can't pass to a
// Client Component, so we only forward the form-render-relevant fields.
export interface SettingDefinitionView {
  key: string;
  group: string;
  label: string;
  description?: string;
  defaultValue: unknown;
  /** Populated when the underlying schema is `z.enum([...])`. The form
   *  renders these as a dropdown in registration order; the optional
   *  `label` is the human-readable text (raw token when not provided). */
  enumOptions?: { value: string; label: string }[];
}

export interface ThemeSettingValue {
  definition: SettingDefinitionView;
  value: unknown;
}

async function commonGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "themes.manage")) {
    return { ok: false, error: "You don't have permission to manage themes" };
  }
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

/**
 * Pull every setting registered with a key namespaced as
 * `theme.<slug>.*` plus its current value. The settings page renders
 * the form straight off this list — themes that register additional
 * settings in their `register(api)` show up automatically.
 */
export async function getThemeSettings(slug: string): Promise<ThemeSettingValue[]> {
  const prefix = `theme.${slug}.`;
  const defs = listDefinitions().filter((d) => d.key.startsWith(prefix));
  // Sort by group + key so the form has a stable order across reloads.
  defs.sort((a, b) =>
    a.group !== b.group ? a.group.localeCompare(b.group) : a.key.localeCompare(b.key),
  );
  const out: ThemeSettingValue[] = [];
  for (const def of defs) {
    const value = await getSetting(db(), def.key);
    // `z.enum([...])` carries its allowed values on both `_def.values`
    // and the public `.options` getter. Duck-type on those properties
    // rather than `instanceof ZodEnum` — RSC and the theme's `register`
    // path can resolve different copies of the `zod` module, so the
    // prototype chain doesn't always line up across the boundary.
    let enumOptions: SettingDefinitionView["enumOptions"];
    const schema = def.schema as unknown as {
      _def?: { typeName?: string; values?: readonly string[] };
      options?: readonly string[];
    };
    const isEnum =
      schema?._def?.typeName === "ZodEnum" ||
      Array.isArray(schema?.options) ||
      Array.isArray(schema?._def?.values);
    if (isEnum) {
      const tokens =
        (schema.options ?? schema._def?.values ?? []) as readonly string[];
      if (tokens.length > 0) {
        enumOptions = tokens.map((tok) => ({
          value: tok,
          label: def.optionLabels?.[tok] ?? tok,
        }));
      }
    }
    out.push({
      definition: {
        key: def.key,
        group: def.group,
        label: def.label,
        description: def.description,
        defaultValue: def.defaultValue,
        enumOptions,
      },
      value: value ?? def.defaultValue,
    });
  }

  // Custom-template settings — the themes plugin's `register()` only
  // walks `TEMPLATE_IDS` at boot, so per-custom keys like
  // `theme.<slug>.template.<custom-slug>.show_left_sidebar` are never
  // declared as definitions. The DB rows exist (seeded by
  // `createCustomTemplate`), but without an entry here the Layout form
  // can't read or write them. Mirror the parent template's view object
  // under the custom's keyspace so the form treats them as first-class.
  const { customsByParent } = await listTemplates(db(), slug);
  const customs = Object.values(customsByParent).flat();
  for (const custom of customs) {
    const parentPrefix = `theme.${slug}.template.${custom.parentTemplate}.`;
    const customPrefix = `theme.${slug}.template.${custom.slug}.`;
    const parentRows = out.filter((row) => row.definition.key.startsWith(parentPrefix));
    for (const parentRow of parentRows) {
      const customKey = customPrefix + parentRow.definition.key.slice(parentPrefix.length);
      const customValue = await getSetting(db(), customKey);
      out.push({
        definition: { ...parentRow.definition, key: customKey },
        value: customValue ?? parentRow.definition.defaultValue,
      });
    }
  }

  return out;
}

/**
 * Persist a single setting. The settings page calls this once per
 * touched field on save; doing it field-by-field keeps the action
 * small and lets a per-field validation failure not block the rest.
 */
export async function saveThemeSettingAction(
  slug: string,
  key: string,
  value: unknown,
): Promise<SaveResult> {
  if (!key.startsWith(`theme.${slug}.`)) {
    return { ok: false, error: "Setting key does not belong to this theme" };
  }
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    await setSetting(db(), key, value, { updatedBy: guard.userId });
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "themes.settings.updated",
      targetType: "theme_setting",
      targetId: key,
      diff: { value },
    });
  } catch {}
  bustThemeSettingCaches(slug);
  return { ok: true };
}

function bustThemeSettingCaches(slug: string): void {
  revalidatePath(`/admin/themes/${slug}/settings`);
  // Sidebar-visibility / layout settings affect public render — bust the
  // public cache too. Cheap (a layout revalidate) and there's no useful
  // way to know which keys do and don't affect public render at this
  // layer.
  revalidatePath("/", "layout");
  // user_overrides_css and brand_* (via tokens.css) are served at their
  // own routes — bust them too. Doing it unconditionally is cheap and
  // avoids tracking which key was edited.
  revalidatePath(`/api/themes/${slug}/user-overrides.css`);
  revalidatePath(`/api/themes/${slug}/tokens.css`);
}

// ---------------------------------------------------------------------------
// Backup / Restore
// ---------------------------------------------------------------------------

export interface ThemeSettingsExport {
  /** Schema version. Bumped if the export shape changes. */
  version: 1;
  /** Theme slug at export time. The importer warns when this differs
   *  from the current theme but allows the user to apply anyway. */
  themeSlug: string;
  /** ISO 8601 timestamp the export was generated. */
  exportedAt: string;
  /** Snapshot of every registered `theme.<slug>.*` setting key paired
   *  with its current value (or its registered default if no row
   *  exists yet). */
  settings: Record<string, unknown>;
}

export type ExportResult =
  | { ok: true; export: ThemeSettingsExport }
  | { ok: false; error: string };

/**
 * Snapshot every `theme.<slug>.*` registered setting plus its current
 * value. The client wraps the result in a Blob and triggers a download
 * — keeping the action plain JSON keeps the contract test-friendly.
 */
export async function exportThemeSettingsAction(slug: string): Promise<ExportResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  try {
    const rows = await getThemeSettings(slug);
    const settings: Record<string, unknown> = {};
    for (const row of rows) settings[row.definition.key] = row.value;
    const payload: ThemeSettingsExport = {
      version: 1,
      themeSlug: slug,
      exportedAt: new Date().toISOString(),
      settings,
    };
    try {
      await auditLog(db(), {
        actorUserId: guard.userId,
        action: "themes.settings.exported",
        targetType: "theme",
        targetId: slug,
        diff: { count: rows.length },
      });
    } catch {}
    return { ok: true, export: payload };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Export failed" };
  }
}

export interface RestorePreview {
  /** Slug recorded in the uploaded file. */
  fileThemeSlug: string;
  /** True when the file targets a different theme than the current page. */
  slugMismatch: boolean;
  /** ISO timestamp recorded in the file. */
  exportedAt: string;
  /** Keys present in the file that match a registered `theme.<slug>.*`
   *  setting on this server and will be applied. */
  applicable: string[];
  /** Keys present in the file but unknown to this theme. They are
   *  silently skipped on confirm. */
  unknown: string[];
  /** Keys registered on this theme that are NOT in the file — they
   *  remain unchanged after import. */
  missing: string[];
}

export type PreviewResult =
  | { ok: true; preview: RestorePreview }
  | { ok: false; error: string };

function parseExport(text: string): ThemeSettingsExport | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      (parsed as { version?: unknown }).version !== 1 ||
      typeof (parsed as { themeSlug?: unknown }).themeSlug !== "string" ||
      typeof (parsed as { exportedAt?: unknown }).exportedAt !== "string" ||
      typeof (parsed as { settings?: unknown }).settings !== "object" ||
      (parsed as { settings: unknown }).settings === null
    ) {
      return null;
    }
    return parsed as ThemeSettingsExport;
  } catch {
    return null;
  }
}

export async function previewImportThemeSettingsAction(
  slug: string,
  formData: FormData,
): Promise<PreviewResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file uploaded" };
  }
  // 1MB ceiling — settings exports are tiny; this is a generous cap
  // that still rejects pathological uploads.
  if (file.size > 1024 * 1024) {
    return { ok: false, error: "File too large (max 1MB)" };
  }
  const text = await file.text();
  const parsed = parseExport(text);
  if (!parsed) {
    return { ok: false, error: "File is not a valid theme settings export" };
  }
  const prefix = `theme.${slug}.`;
  const registered = new Set(
    listDefinitions().filter((d) => d.key.startsWith(prefix)).map((d) => d.key),
  );
  const fileKeys = Object.keys(parsed.settings);
  const applicable = fileKeys.filter((k) => registered.has(k));
  const unknown = fileKeys.filter((k) => !registered.has(k));
  const missing = Array.from(registered).filter((k) => !(k in parsed.settings));
  return {
    ok: true,
    preview: {
      fileThemeSlug: parsed.themeSlug,
      slugMismatch: parsed.themeSlug !== slug,
      exportedAt: parsed.exportedAt,
      applicable: applicable.sort(),
      unknown: unknown.sort(),
      missing: missing.sort(),
    },
  };
}

export interface RestoreSummary {
  applied: number;
  skipped: number;
  failed: { key: string; error: string }[];
}

export type RestoreResult =
  | { ok: true; summary: RestoreSummary }
  | { ok: false; error: string };

/**
 * Apply an uploaded export to this theme's settings. Each key is
 * validated through `setSetting` (which runs the registered Zod
 * schema) so a single bad value does not abort the rest of the import.
 *
 * Unknown keys (not registered for this theme) are skipped silently.
 * The slug recorded in the file is informational only — the import
 * always targets the current theme. The client preview surfaces a
 * mismatch so the user can decide whether to proceed.
 */
export async function importThemeSettingsAction(
  slug: string,
  formData: FormData,
): Promise<RestoreResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "No file uploaded" };
  }
  if (file.size > 1024 * 1024) {
    return { ok: false, error: "File too large (max 1MB)" };
  }
  const text = await file.text();
  const parsed = parseExport(text);
  if (!parsed) {
    return { ok: false, error: "File is not a valid theme settings export" };
  }
  const prefix = `theme.${slug}.`;
  const registered = new Set(
    listDefinitions().filter((d) => d.key.startsWith(prefix)).map((d) => d.key),
  );
  const summary: RestoreSummary = { applied: 0, skipped: 0, failed: [] };
  for (const [key, value] of Object.entries(parsed.settings)) {
    if (!registered.has(key)) {
      summary.skipped += 1;
      continue;
    }
    try {
      await setSetting(db(), key, value, { updatedBy: guard.userId });
      summary.applied += 1;
    } catch (err) {
      summary.failed.push({
        key,
        error: err instanceof Error ? err.message : "Save failed",
      });
    }
  }
  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "themes.settings.imported",
      targetType: "theme",
      targetId: slug,
      diff: {
        applied: summary.applied,
        skipped: summary.skipped,
        failed: summary.failed.length,
        sourceThemeSlug: parsed.themeSlug,
      },
    });
  } catch {}
  bustThemeSettingCaches(slug);
  return { ok: true, summary };
}

// ---------------------------------------------------------------------------
// Custom templates
// ---------------------------------------------------------------------------

export async function createCustomTemplateAction(
  themeSlug: string,
  parentTemplate: CloneableTemplateId,
  displayName: string,
): Promise<CreateCustomTemplateResult> {
  const guard = await commonGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  const result = await createCustomTemplate(db(), {
    themeSlug,
    parentTemplate,
    displayName,
  });

  if (result.ok) {
    try {
      await auditLog(db(), {
        actorUserId: guard.userId,
        action: "themes.template.created",
        targetType: "theme_template",
        targetId: `${themeSlug}:${result.slug}`,
        diff: { parentTemplate, displayName },
      });
    } catch {}
    bustThemeSettingCaches(themeSlug);
  }

  return result;
}

export async function renameCustomTemplateAction(
  themeSlug: string,
  slug: string,
  displayName: string,
): Promise<RenameCustomTemplateResult> {
  const guard = await commonGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  const result = await renameCustomTemplate(db(), { themeSlug, slug, displayName });

  if (result.ok) {
    try {
      await auditLog(db(), {
        actorUserId: guard.userId,
        action: "themes.template.renamed",
        targetType: "theme_template",
        targetId: `${themeSlug}:${slug}`,
        diff: { displayName },
      });
    } catch {}
    bustThemeSettingCaches(themeSlug);
  }

  return result;
}

export async function deleteCustomTemplateAction(
  themeSlug: string,
  slug: string,
): Promise<DeleteCustomTemplateResult> {
  const guard = await commonGuard();
  if (!guard.ok) return { ok: false, error: guard.error };

  const result = await deleteCustomTemplate(db(), { themeSlug, slug });

  if (result.ok) {
    try {
      await auditLog(db(), {
        actorUserId: guard.userId,
        action: "themes.template.deleted",
        targetType: "theme_template",
        targetId: `${themeSlug}:${slug}`,
        diff: { slug },
      });
    } catch {}
    bustThemeSettingCaches(themeSlug);
  }

  return result;
}
