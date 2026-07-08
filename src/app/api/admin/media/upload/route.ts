import { NextResponse, type NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { resolveUserId } from "@core/auth/resolve-user";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  uploadMedia,
  readMediaSettings,
  type MediaSummary,
} from "@core-plugins/media/service";

/**
 * Session-authenticated admin upload route — replacement for the
 * `uploadFiles` / `uploadOneForPicker` server actions.
 *
 * Server actions in Next.js stream multipart bodies through a parser that has
 * surfaced "Unexpected end of form" failures during HMR restarts and on long
 * uploads (#21). Route handlers parse via the standard `req.formData()` Web
 * API, which doesn't share that parser and behaves more predictably under
 * the same conditions.
 *
 * Accepts both:
 *   - `files` (multiple) — used by `/admin/media`'s Upload tab
 *   - `file`  (single)   — used by MediaPicker's "quick upload" button
 *
 * Auth model:
 *   - Session cookie via `auth()` — same gate the server actions used.
 *   - SameSite=Lax on the NextAuth cookie blocks cross-site multipart POSTs
 *     so an explicit CSRF check would be redundant for first-party callers.
 */

interface UploadedSummary extends MediaSummary {
  /** Filename the user picked, before any server-side rename (JPEG→WebP). */
  originalFilename: string;
}

interface UploadResponse {
  ok: boolean;
  uploaded: UploadedSummary[];
  errors: { filename: string; error: string }[];
}

function jsonError(status: number, error: string): NextResponse<UploadResponse> {
  return NextResponse.json(
    { ok: false, uploaded: [], errors: [{ filename: "(error)", error }] },
    { status },
  );
}

export async function POST(req: NextRequest): Promise<NextResponse<UploadResponse>> {
  const session = await auth();
  if (!session?.user?.id) return jsonError(401, "Not authenticated");

  const userId = await resolveUserId(db(), session.user);
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "media.add")) {
    return jsonError(403, "Your role does not permit uploads");
  }

  const writeable = await assertWriteable(db());
  if (!writeable.ok) return jsonError(503, writeable.error!);

  let form: FormData;
  try {
    form = await req.formData();
  } catch (err) {
    // Genuinely-truncated multipart bodies (network blip, page nav, HMR
    // restart) land here. Surfaces a clean error instead of an opaque
    // framework crash.
    const raw = err instanceof Error ? err.message : String(err);
    return jsonError(
      400,
      /unexpected end of form/i.test(raw)
        ? "Upload interrupted before the file finished sending. Try again."
        : `Could not parse upload: ${raw}`,
    );
  }

  // Pull files from both `files` (multi) and `file` (single) so the route
  // can serve UploadTab (multi) and MediaPicker (single) without forking.
  const files: File[] = [];
  for (const v of form.getAll("files")) {
    if (v instanceof File) files.push(v);
  }
  const single = form.get("file");
  if (single instanceof File) files.push(single);

  if (files.length === 0) {
    return jsonError(400, "No files provided");
  }

  const settings = await readMediaSettings(db());
  const uploaded: UploadedSummary[] = [];
  const errors: { filename: string; error: string }[] = [];

  for (const f of files) {
    try {
      const arrayBuffer = await f.arrayBuffer();
      const result = await uploadMedia(
        db(),
        { filename: f.name, mime: f.type, bytes: Buffer.from(arrayBuffer), uploadedBy: userId },
        settings,
      );
      if (result.ok) {
        uploaded.push({ ...result.media, originalFilename: f.name });
      } else {
        errors.push({ filename: f.name, error: result.error });
      }
    } catch (err) {
      // Belt-and-suspenders: uploadMedia returns structured errors for known
      // failure modes, but an unhandled throw here would crash the route
      // handler and yield an empty 500 body — surfacing as "Unexpected end of
      // JSON input" client-side. Keep the response shape JSON regardless.
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ filename: f.name, error: `Server error: ${message}` });
    }
  }

  if (uploaded.length > 0) {
    try {
      await auditLog(db(), {
        actorUserId: userId,
        action: "media.upload",
        targetType: "media",
        targetId: uploaded.map((m) => m.id).join(","),
        diff: {
          count: uploaded.length,
          filenames: uploaded.map((m) => m.filename),
          source: "admin-upload-route",
        },
      });
    } catch { /* audit non-fatal */ }
  }

  // Mirrors the server action's revalidatePath so the Library tab refreshes
  // when the user switches to it after uploading.
  revalidatePath("/admin/media");

  return NextResponse.json({ ok: errors.length === 0, uploaded, errors });
}
