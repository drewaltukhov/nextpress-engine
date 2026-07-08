import { z } from "zod";

const slugRe = /^[a-z][a-z0-9-]*$/;

/**
 * Per-plugin admin chrome (sidebar entry, plugin-list "Settings" cog).
 * Required when `capabilities.registers_admin_menu === true` — see the
 * `superRefine` below.
 *
 * `icon` is a Lucide-style SVG path data string (the `d` attribute
 * content, optionally space-separated for multi-segment glyphs). The
 * shell renders it inside a fixed-size `<svg viewBox="0 0 24 24">`.
 */
const adminPresenceSchema = z.object({
  label: z.string().min(1, "admin.label is required"),
  icon: z.string().min(1, "admin.icon is required"),
});

export const manifestSchema = z
  .object({
    slug: z.string().regex(slugRe, "slug must be lowercase kebab-case"),
    name: z.string().min(1),
    version: z.string().min(1),
    engine: z.string().min(1),
    type: z.enum(["plugin", "theme"]).default("plugin"),
    tier: z.enum(["essential", "standard"]).default("standard"),
    dependencies: z.array(z.string().regex(slugRe)).default([]),
    capabilities: z
      .object({
        registers_post_type: z.boolean().optional(),
        registers_taxonomy: z.boolean().optional(),
        registers_admin_menu: z.boolean().optional(),
        registers_routes: z.boolean().optional(),
        exposes_hooks: z.array(z.string()).optional(),
      })
      .default({}),
    /**
     * Plugin's admin-shell presence — the label + icon for the sidebar
     * entry and the link target the plugin-list "Settings" cog opens.
     * Optional in the type, but enforced as required at parse time when
     * `registers_admin_menu` is true (refinement below).
     */
    admin: adminPresenceSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.capabilities.registers_admin_menu === true && !data.admin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["admin"],
        message:
          "admin block is required when capabilities.registers_admin_menu is true (label + icon)",
      });
    }
  });

export type PluginManifest = z.infer<typeof manifestSchema>;

export function parseManifest(input: unknown): PluginManifest {
  return manifestSchema.parse(input);
}
