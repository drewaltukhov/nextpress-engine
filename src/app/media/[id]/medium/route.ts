import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getMediaById, getMediaMedium } from "@core-plugins/media/service";

/**
 * Serve the medium (≤1280px WebP) variant for a media id — public, same
 * cache policy as the original and thumb routes. Falls back to the original
 * when no medium exists (legacy rows pre-005_add_medium, SVG, or sharp
 * failure at upload).
 *
 * Storage-backend dispatch parallels `/media/[id]/thumb/route.ts`:
 *   - `storage_backend = 'db'` → serve `medium_data` (or `blob_data` fallback).
 *   - `storage_backend = 'r2'` → 302 to the R2 medium URL; if no medium
 *     exists (`medium_mime IS NULL`), redirect to the original key.
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
    const key = row.hasMedium
      ? row.storageRef.replace(/\.[^./]+$/, "-medium.webp")
      : row.storageRef;
    return NextResponse.redirect(`${base}/${key}`, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // db backend — serve bytes inline (getMediaMedium handles medium→original
  // fallback when medium_data is NULL).
  const blob = await getMediaMedium(db(), id);
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
