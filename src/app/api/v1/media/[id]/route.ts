import { NextResponse, type NextRequest } from "next/server";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import { getMediaById, deleteMedia, type MediaSummary } from "@core-plugins/media/service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function readId(req: NextRequest): string | null {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  return last ? decodeURIComponent(last) : null;
}

function serializeMedia(m: MediaSummary) {
  return {
    id: m.id,
    filename: m.filename,
    mime: m.mime,
    size_bytes: m.sizeBytes,
    width: m.width,
    height: m.height,
    alt_text: m.altText,
    uploaded_by: m.uploadedBy,
    uploaded_at: m.uploadedAt,
    url: getMediaPublicUrl({ id: m.id, hasThumb: m.hasThumb, variant: "original", contentVersion: m.contentVersion }),
    thumb_url: getMediaPublicUrl({ id: m.id, hasThumb: m.hasThumb, variant: "thumb", contentVersion: m.contentVersion }),
  };
}

async function getHandler(req: NextRequest) {
  const id = readId(req);
  if (!id) return jsonError("not_found", "Media not found", 404);
  const media = await getMediaById(db(), id);
  if (!media) return jsonError("not_found", "Media not found", 404);
  return NextResponse.json({ data: serializeMedia(media) });
}

async function deleteHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;
  const id = readId(req);
  if (!id) return jsonError("not_found", "Media not found", 404);

  const existing = await getMediaById(db(), id);
  if (!existing) return jsonError("not_found", "Media not found", 404);

  await deleteMedia(db(), id);

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "media.delete",
    targetType: "media",
    targetId: id,
    diff: { filename: existing.filename, mediaId: id },
  }).catch(() => {});

  return NextResponse.json({ data: { id, deleted: true } });
}

export const GET = withBearerAuth({ scopes: ["media:read"] }, getHandler);
export const DELETE = withBearerAuth({ scopes: ["media:delete"] }, deleteHandler);
