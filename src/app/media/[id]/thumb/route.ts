import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getMediaById, getMediaThumb } from "@core-plugins/media/service";

/**
 * Serve the 600px WebP thumbnail for a media id — public, same policy as
 * the full-resolution route. Falls back to the original when no thumb
 * exists (older rows, SVG, sharp failure).
 *
 * Storage-backend dispatch parallels `/media/[id]/route.ts`:
 *   - `storage_backend = 'db'` → serve `thumb_data` (or `blob_data` fallback).
 *   - `storage_backend = 'r2'` → 302 to the R2 thumb URL; if no thumb exists
 *     for the row (`thumb_mime IS NULL`), redirect to the original key.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!id || id.length > 100) {
    return new NextResponse("Bad request", { status: 400 });
  }

  const row = await getMediaById(db(), id);
  if (!row) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (row.storageBackend === "r2") {
    const base = (process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? "").replace(/\/+$/, "");
    if (!base) {
      return new NextResponse("R2 public URL not configured", { status: 500 });
    }
    const key = row.hasThumb
      ? row.storageRef.replace(/\.[^./]+$/, "-thumb.webp")
      : row.storageRef;
    return NextResponse.redirect(`${base}/${key}`, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // db backend — serve bytes inline (getMediaThumb already handles thumb→
  // original fallback for DB rows when thumb_data is NULL).
  const blob = await getMediaThumb(db(), id);
  if (!blob) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = new ArrayBuffer(blob.data.byteLength);
  new Uint8Array(body).set(blob.data);

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": blob.mime,
      "Content-Length": String(blob.sizeBytes),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
