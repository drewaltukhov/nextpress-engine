import { z } from "zod";
import type { PluginAPI } from "@core/plugins/api";
import { defineSettings } from "@core-plugins/settings/registry";

/**
 * Media core-plugin — image library.
 *
 * Owns the `media` table (DB-blob backend) and the two media settings.
 * Service layer + admin UI live alongside (`./service`, app routes).
 *
 * Future plugin storage backends (vercel-blob, S3, etc.) will register via
 * an `api.media.registerStorage()` surface that doesn't exist yet — the
 * schema's `storage_backend` + `storage_ref` columns already accommodate
 * them.
 */
export default function register(_api: PluginAPI): void {
  defineSettings([
    {
      key: "media.allowed_mime_types",
      group: "Media",
      label: "Allowed image types",
      description: "MIME types accepted by the upload form.",
      schema: z.array(z.string()).min(1),
      defaultValue: ["image/jpeg", "image/png", "image/webp"],
      scope: "private",
    },
    {
      key: "media.max_file_size_mb",
      group: "Media",
      label: "Maximum file size (MB)",
      schema: z.number().int().min(1).max(100),
      defaultValue: 5,
      scope: "private",
    },
    {
      key: "media.convert_to_webp",
      group: "Media",
      label: "Auto-convert JPEG/BMP uploads to WebP",
      description: "When enabled, JPEG and BMP uploads are re-encoded as WebP at quality 90 before storage.",
      schema: z.boolean(),
      defaultValue: true,
      scope: "private",
    },
    {
      key: "media.storage_backend",
      group: "Media",
      label: "Storage backend",
      description:
        "Where new uploads are persisted. 'db' stores bytes in the media table; 'r2' uploads to Cloudflare R2 (requires R2_* env vars). Existing rows keep their backend regardless of this setting.",
      schema: z.enum(["db", "r2"]),
      defaultValue: "db",
      scope: "private",
    },
  ]);
}
