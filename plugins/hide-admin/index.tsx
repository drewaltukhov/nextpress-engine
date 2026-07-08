import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings } from "@core-plugins/settings/registry";

/**
 * Hide Admin plugin.
 *
 * Owns one setting: `hide-admin.path`. The proxy reads it via
 * `getAdminPath(db)` and routes accordingly. Empty string = hide off.
 * Validation happens at the server-action layer; we keep this schema
 * permissive so an out-of-band write doesn't break boot.
 */
export default function register(_api: PluginAPI): void {
  defineSettings([
    {
      key: "hide-admin.path",
      group: "Hide Admin",
      label: "Admin path",
      description: "Custom URL the admin login lives at. Empty disables hiding.",
      schema: z.string().max(64),
      defaultValue: "",
      scope: "private",
    },
  ]);
}
