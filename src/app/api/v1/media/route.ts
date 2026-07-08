import { NextResponse, type NextRequest } from "next/server";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import {
  listMedia,
  uploadMedia,
  readMediaSettings,
  type MediaSummary,
} from "@core-plugins/media/service";
import { getMediaPublicUrl } from "@core-plugins/media/storage/url";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
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

async function listHandler(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("page_size") ?? "24") || 24));

  const result = await listMedia(db(), { page, pageSize });
  return NextResponse.json({
    data: result.rows.map(serializeMedia),
    meta: { page: result.page, page_size: result.pageSize, total: result.total },
  });
}

async function uploadHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("multipart/form-data")) {
    return jsonError(
      "invalid_body",
      "Upload requires Content-Type: multipart/form-data with a 'file' field",
      400,
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError("invalid_body", "Could not parse multipart body", 400);
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return jsonError("validation_error", "Missing 'file' field in multipart body", 400);
  }

  const settings = await readMediaSettings(db());
  const arrayBuffer = await file.arrayBuffer();
  const result = await uploadMedia(
    db(),
    {
      filename: file.name,
      mime: file.type,
      bytes: Buffer.from(arrayBuffer),
      uploadedBy: ctx.userId,
    },
    settings,
  );

  if (!result.ok) {
    return jsonError("upload_rejected", result.error, 400);
  }

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "media.upload",
    targetType: "media",
    targetId: result.media.id,
    diff: { filename: result.media.filename, size_bytes: result.media.sizeBytes },
  }).catch(() => {});

  return NextResponse.json({ data: serializeMedia(result.media) }, { status: 201 });
}

export const GET = withBearerAuth({ scopes: ["media:read"] }, listHandler);
export const POST = withBearerAuth({ scopes: ["media:upload"] }, uploadHandler);
