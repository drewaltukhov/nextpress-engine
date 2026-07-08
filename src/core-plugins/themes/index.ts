import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings } from "@core-plugins/settings/registry";
import { discoveredPlugins } from "@generated/plugins";
import { TEMPLATE_IDS, TEMPLATE_LABELS, SIDEBAR_SIDES, type TemplateId } from "./templates";
import {
  COLUMN_PRESETS,
  CONTAINER_WIDTH_MODES,
  CONTAINER_WIDTH_PRESETS,
  DEFAULT_COLUMN_PRESET,
  DEFAULT_CONTAINER_WIDTH_MODE,
  DEFAULT_CONTAINER_WIDTH_PRESET,
  DEFAULT_CONTAINER_WIDTH_CUSTOM,
} from "./layout";

/**
 * Themes core-plugin — owns the `theme_data` table, the active-theme
 * setting (`theme.active_slug`), and the stock per-theme setting
 * definitions every theme automatically gets:
 *
 *   Per-template (one set per template id):
 *   - `theme.<slug>.template.<id>.show_left_sidebar`           (boolean)
 *   - `theme.<slug>.template.<id>.show_right_sidebar`          (boolean)
 *   - `theme.<slug>.template.<id>.custom_left_sidebar`         (boolean)
 *   - `theme.<slug>.template.<id>.custom_right_sidebar`        (boolean)
 *   - `theme.<slug>.template.<id>.column_preset`               (enum)
 *   - `theme.<slug>.template.<id>.expand_main_when_no_sidebars` (boolean)
 *
 *   Site-wide (one set per theme):
 *   - `theme.<slug>.container_width_mode`                       (enum)
 *   - `theme.<slug>.container_width_preset`                     (enum)
 *   - `theme.<slug>.container_width_custom`                     (string)
 *   - `theme.<slug>.container_apply_to_header`                  (boolean)
 *   - `theme.<slug>.container_apply_to_footer`                  (boolean)
 *   - `theme.<slug>.user_overrides_css`                         (string)
 *
 * Each discovered theme (manifest.type === "theme") gets these defs
 * registered on boot, so the per-theme settings page can render them
 * without each theme needing to declare them. Themes that want
 * additional settings (logo media id, brand colors, footer text)
 * register their own definitions in their own `register(api)`.
 */
export default function register(_api: PluginAPI): void {
  for (const entry of discoveredPlugins) {
    if (entry.manifest.type !== "theme") continue;
    const slug = entry.manifest.slug;
    const layoutGroup = `theme.${slug}.layout`;
    const containerGroup = `theme.${slug}.container`;
    const defs = [];
    for (const tid of TEMPLATE_IDS) {
      for (const side of SIDEBAR_SIDES) {
        defs.push({
          key: `theme.${slug}.template.${tid}.show_${side}_sidebar`,
          group: layoutGroup,
          label: `${labelForSide(side)} sidebar on ${labelForTemplate(tid)}`,
          schema: z.boolean(),
          defaultValue: true,
          scope: "public" as const,
        });
        // Opt-in per-template sidebar override. When true, the public
        // renderer reads `(left|right)-sidebar:<templateId>` instead of
        // the shared `(left|right)-sidebar` part. Default false →
        // every template inherits the shared sidebars (status quo).
        defs.push({
          key: `theme.${slug}.template.${tid}.custom_${side}_sidebar`,
          group: layoutGroup,
          label: `Custom ${labelForSide(side).toLowerCase()} sidebar on ${labelForTemplate(tid)}`,
          description:
            "When on, this template uses its own widgets in the sidebar instead of the shared default.",
          schema: z.boolean(),
          defaultValue: false,
          scope: "public" as const,
        });
      }
      defs.push({
        key: `theme.${slug}.template.${tid}.column_preset`,
        group: layoutGroup,
        label: `Column preset on ${labelForTemplate(tid)}`,
        description:
          "Three-column ratio for left sidebar / main / right sidebar.",
        schema: z.enum(COLUMN_PRESETS),
        defaultValue: DEFAULT_COLUMN_PRESET,
        scope: "public" as const,
      });
      defs.push({
        key: `theme.${slug}.template.${tid}.expand_main_when_no_sidebars`,
        group: layoutGroup,
        label: `Expand main on ${labelForTemplate(tid)} when sidebars are off`,
        description:
          "When both sidebars are hidden, stretch the main zone to 100% of the container instead of staying at its preset width.",
        schema: z.boolean(),
        defaultValue: true,
        scope: "public" as const,
      });
    }
    defs.push({
      key: `theme.${slug}.container_width_mode`,
      group: containerGroup,
      label: "Container width mode",
      description: "Fluid (no max), Tailwind preset, or a custom CSS width.",
      schema: z.enum(CONTAINER_WIDTH_MODES),
      defaultValue: DEFAULT_CONTAINER_WIDTH_MODE,
      scope: "public" as const,
    });
    defs.push({
      key: `theme.${slug}.container_width_preset`,
      group: containerGroup,
      label: "Tailwind container preset",
      description: "Used when container width mode is set to Preset.",
      schema: z.enum(CONTAINER_WIDTH_PRESETS),
      defaultValue: DEFAULT_CONTAINER_WIDTH_PRESET,
      scope: "public" as const,
    });
    defs.push({
      key: `theme.${slug}.container_width_custom`,
      group: containerGroup,
      label: "Custom container width",
      description:
        "CSS length used when mode is Custom (e.g. 1280px, 90rem, 80%).",
      schema: z.string(),
      defaultValue: DEFAULT_CONTAINER_WIDTH_CUSTOM,
      scope: "public" as const,
    });
    defs.push({
      key: `theme.${slug}.container_apply_to_header`,
      group: containerGroup,
      label: "Apply container width to header",
      description:
        "Constrain the header content to the container width. Off keeps the header full-width.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "public" as const,
    });
    defs.push({
      key: `theme.${slug}.container_apply_to_footer`,
      group: containerGroup,
      label: "Apply container width to footer",
      description:
        "Constrain the footer content to the container width. Off keeps the footer full-width.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "public" as const,
    });
    // Three breakpoint-scoped CSS blobs concatenated by the
    // /api/themes/<slug>/user-overrides.css route — desktop served as-is,
    // tablet wrapped in `@media (max-width: 1023px)`, mobile wrapped in
    // `@media (max-width: 767px)`. The 768px / 1024px breakpoints match
    // Tailwind's `md` / `lg` and align with the per-widget hide toggles
    // (which use `max-md:hidden`).
    defs.push({
      key: `theme.${slug}.user_overrides_css`,
      group: `theme.${slug}.advanced`,
      label: "Custom CSS (Desktop)",
      description:
        "Base custom CSS applied at every breakpoint. Served at /api/themes/<slug>/user-overrides.css.",
      schema: z.string(),
      defaultValue: "",
      scope: "public" as const,
    });
    defs.push({
      key: `theme.${slug}.user_overrides_css_tablet`,
      group: `theme.${slug}.advanced`,
      label: "Custom CSS (Tablet)",
      description:
        "Overrides applied at tablet widths (≤1023px). Wrapped in @media (max-width: 1023px).",
      schema: z.string(),
      defaultValue: "",
      scope: "public" as const,
    });
    defs.push({
      key: `theme.${slug}.user_overrides_css_mobile`,
      group: `theme.${slug}.advanced`,
      label: "Custom CSS (Mobile)",
      description:
        "Overrides applied at mobile widths (≤767px). Wrapped in @media (max-width: 767px).",
      schema: z.string(),
      defaultValue: "",
      scope: "public" as const,
    });
    defineSettings(defs);
  }
}

function labelForSide(side: "left" | "right"): string {
  return side === "left" ? "Left" : "Right";
}

function labelForTemplate(id: string): string {
  return TEMPLATE_LABELS[id as TemplateId] ?? id;
}

export {
  getActiveThemeSlug,
  setActiveThemeSlug,
  listThemes,
  getThemeListItem,
  getThemeData,
  listThemeData,
  setThemeData,
  resetThemeData,
  applyThemeDefaults,
  listTemplates,
  listActiveCustomsForParent,
  effectiveTemplateId,
  createCustomTemplate,
  renameCustomTemplate,
  deleteCustomTemplate,
  getParentTemplate,
  deriveCustomTemplateSlug,
  type ThemeListItem,
  type ThemeDataValue,
  type ApplyDefaultsResult,
  type CustomTemplateRow,
  type CustomTemplateOption,
  type ListTemplatesResult,
  type CreateCustomTemplateInput,
  type CreateCustomTemplateResult,
  type RenameCustomTemplateInput,
  type RenameCustomTemplateResult,
  type DeleteCustomTemplateInput,
  type DeleteCustomTemplateResult,
} from "./service";

export {
  THEME_DATA_KINDS,
  type ThemeDataKind,
} from "./schema/themes";

export {
  TEMPLATE_IDS,
  TEMPLATE_LABELS,
  SIDEBAR_SIDES,
  CLONEABLE_TEMPLATE_IDS,
  TEMPLATE_SETTING_FIELDS,
  surfaceForTemplate,
  type TemplateId,
  type SidebarSide,
  type CloneableTemplateId,
  type TemplateSettingField,
} from "./templates";

export {
  COLUMN_PRESETS,
  COLUMN_PRESET_LABELS,
  CONTAINER_WIDTH_MODES,
  CONTAINER_WIDTH_MODE_LABELS,
  CONTAINER_WIDTH_PRESETS,
  CONTAINER_WIDTH_PRESET_LABELS,
  DEFAULT_COLUMN_PRESET,
  DEFAULT_CONTAINER_WIDTH_MODE,
  DEFAULT_CONTAINER_WIDTH_PRESET,
  DEFAULT_CONTAINER_WIDTH_CUSTOM,
  type ColumnPreset,
  type ContainerWidthMode,
  type ContainerWidthPreset,
} from "./layout";

export { renderActiveTheme, type ActiveThemeContext, type RenderActiveThemeResult } from "./render";

export {
  getHomepageContentSource,
  setHomepageContentSource,
  type HomepageSource,
  type HomepageSourceKind,
  type SetHomepageContentSourceInput,
  type SetHomepageSourceResult,
} from "./homepage-source-actions";

export {
  registerThemeDefaults,
  getThemeDefaults,
  type ThemeDefaults,
  type ThemePuckData,
} from "./defaults-registry";
