import type { Surface } from "@core/blocks/registry";

/**
 * Shared list of template ids that NextPress expects every theme to
 * implement, plus the two sidebar sides used in the per-template
 * sidebar visibility settings keys. Centralised here so the themes
 * service, the per-theme settings registration, the builder client,
 * and the public renderer all agree on the same vocabulary.
 *
 * Adding a new template (or sidebar side) is a coordinated change:
 *   1. Add to TEMPLATE_IDS (and TEMPLATE_LABELS).
 *   2. Add the matching Surface in src/core/blocks/registry.ts.
 *   3. Wire it in the builder client's TEMPLATES array.
 *   4. Wire it in the public renderer (Phase 7).
 */
export const TEMPLATE_IDS = [
  "homepage",
  "single-page",
  "single-post",
  "single-pillar",
  "topic-archive",
  "not-found",
  "search-results",
  "author",
] as const;

export type TemplateId = (typeof TEMPLATE_IDS)[number];

export const TEMPLATE_LABELS: Record<TemplateId, string> = {
  homepage: "Homepage",
  "single-page": "Single Page",
  "single-post": "Single Post",
  "single-pillar": "Pillar Post",
  "topic-archive": "Topic Archive",
  "not-found": "404 Not Found",
  "search-results": "Search Results",
  author: "Author Profile",
};

export const SIDEBAR_SIDES = ["left", "right"] as const;
export type SidebarSide = (typeof SIDEBAR_SIDES)[number];

// ─── Custom template vocabulary ─────────────────────────────────────────────

/**
 * The four built-in templates that users may clone. Homepage / 404 /
 * Author / Search Results are singular routes and are not cloneable.
 */
export const CLONEABLE_TEMPLATE_IDS = [
  "single-page",
  "single-post",
  "single-pillar",
  "topic-archive",
] as const;

export type CloneableTemplateId = (typeof CLONEABLE_TEMPLATE_IDS)[number];

/**
 * The 6 per-template setting fields registered by the themes plugin's
 * index.ts boot loop. Enumerating them here lets `createCustomTemplate`
 * know exactly which keys to read from the parent and seed into the
 * custom's keyspace (copy-on-clone).
 */
export const TEMPLATE_SETTING_FIELDS = [
  "column_preset",
  "show_left_sidebar",
  "show_right_sidebar",
  "custom_left_sidebar",
  "custom_right_sidebar",
  "expand_main_when_no_sidebars",
] as const;

export type TemplateSettingField = (typeof TEMPLATE_SETTING_FIELDS)[number];

/**
 * Resolve the Puck `Surface` for either a built-in or custom template.
 *
 * - Built-ins: `template-<id>` (unchanged).
 * - Customs: return the parent's surface so the builder widget palette
 *   is inherited without creating new Surface union values.
 * - Unknown id + no parent: defensive null (caller renders empty palette).
 */
export function surfaceForTemplate(
  templateId: string,
  parentTemplate: string | null,
): Surface | null {
  if (parentTemplate) {
    return `template-${parentTemplate}` as Surface;
  }
  if ((TEMPLATE_IDS as readonly string[]).includes(templateId)) {
    return `template-${templateId as TemplateId}` as Surface;
  }
  return null;
}
