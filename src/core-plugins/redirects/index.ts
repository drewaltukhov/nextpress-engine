import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings } from "@core-plugins/settings/registry";

/**
 * Redirects core-plugin — path-based redirect matching with auto-creation
 * on slug/permalink changes, cycle detection, and hit tracking.
 *
 * Phase 6 surfaces:
 *  - matchRedirect() — find active redirect for a path
 *  - createRedirect() / createAutoRedirect() — with cycle validation
 *  - bumpHitCount() — async hit tracking
 *  - setRedirectActive() / deactivateRedirect() / deleteRedirect()
 *  - listRedirects() — admin list query
 *
 * Pending follow-ups:
 *  - Hook wiring for posts/terms/media slug changes (when those plugins ship)
 *  - matchRedirect wired into edge middleware (issue #12)
 */
export default function register(_api: PluginAPI): void {
  defineSettings([
    {
      key: "redirects.default_status",
      group: "Redirects",
      label: "Default redirect status",
      description: "Status code used when none is provided. 301 = permanent (recommended for SEO), 302 = temporary, 307/308 preserve the request method.",
      schema: z
        .number()
        .int()
        .refine((n) => [301, 302, 307, 308].includes(n), {
          message: "Must be 301, 302, 307, or 308",
        }),
      defaultValue: 301,
      scope: "private",
    },
    {
      key: "redirects.auto_on_slug_change",
      group: "Redirects",
      label: "Auto-create redirect on slug change",
      description: "When a post or page slug changes, create a redirect from the old path to the new one.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "private",
    },
    {
      key: "redirects.auto_on_permalink_change",
      group: "Redirects",
      label: "Auto-create redirect on permalink change",
      description: "When the permalink structure changes, create redirects from old paths to new ones.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "private",
    },
    {
      key: "redirects.auto_on_media_rename",
      group: "Redirects",
      label: "Auto-create redirect on media rename",
      description: "When a media file is renamed, create a redirect from the old URL to the new one.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "private",
    },
  ]);
}

export {
  matchRedirect,
  createRedirect,
  createAutoRedirect,
  bumpHitCount,
  setRedirectActive,
  deactivateRedirect,
  deleteRedirect,
  validateNoCycle,
  listRedirects,
  RedirectCycleError,
  type RedirectMatch,
  type CreateRedirectInput,
  type RedirectListItem,
  type RedirectListFilters,
  type RedirectSource,
} from "./service";
