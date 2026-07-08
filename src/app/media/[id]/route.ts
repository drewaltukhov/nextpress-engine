import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getMediaById, getMediaBlob } from "@core-plugins/media/service";

/**
 * Serve a media blob — public. Lookups are by random UUID (id column),
 * which is unguessable in practice, matching the WordPress model where
 * media URLs are public by design so content can embed them anywhere.
 *
 * Storage-backend dispatch lives here so every public URL stays the same
 * `/media/<id>` regardless of where the bytes live:
 *   - `storage_backend = 'db'` → serve `blob_data` directly (CDN-cacheable).
 *   - `storage_backend = 'r2'` → 302 to the R2 public URL. The browser
 *     follows transparently, the CDN can cache the redirect alongside the
 *     R2 object response, and switching backends per-row is invisible to
 *     callers.
 *
 * Soft-deleted rows (deleted_at IS NOT NULL) are excluded inside
 * getMediaBlob / getMediaById, so deletes also pull from the public surface.
 *
 * Bytes are immutable once uploaded so we set a long, immutable
 * Cache-Control with `public` to allow CDN/edge caching.
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
    return NextResponse.redirect(`${base}/${row.storageRef}`, {
      status: 302,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    });
  }

  // db backend — serve bytes inline.
  const blob = await getMediaBlob(db(), id);
  if (!blob) {
    return new NextResponse("Not found", { status: 404 });
  }

  // Copy into a fresh ArrayBuffer — libSQL's Uint8Array<ArrayBufferLike>
  // has a buffer type that doesn't satisfy TS's BodyInit union (it could
  // theoretically be SharedArrayBuffer). Runtime is fine; this is purely
  // a typing workaround.
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
