/**
 * One-off dev seed: download a handful of portrait-oriented coffee photos
 * (Pexels, free license — https://www.pexels.com/license/) and ingest them
 * into the media library, then collect them into a "Coffee (portrait)"
 * gallery so the new Masonry layout has something realistic to render.
 *
 * Run: npx tsx --env-file-if-exists=.env.local scripts/seed-coffee-media.ts
 */
import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import { uploadMedia, readMediaSettings } from "../src/core-plugins/media/service";
import { readImageDimensions } from "../src/core-plugins/media/dimensions";
import {
  createGallery,
  addItemsToGallery,
  GallerySlugConflictError,
} from "../src/core-plugins/galleries/service";

const MAX_IMAGES = 7;
const GALLERY_NAME = "Coffee (portrait)";
const GALLERY_SLUG = "coffee-portrait";

// Pexels CDN URLs for portrait coffee photos (free license). Request a
// ~1200px-wide rendition; uploadMedia caps the stored original at 1920px and
// generates thumb/medium variants on ingest.
const SIZED = "?auto=compress&cs=tinysrgb&w=1200";
const CANDIDATES = [
  "https://images.pexels.com/photos/27860686/pexels-photo-27860686/free-photo-of-coffee-cup.jpeg",
  "https://images.pexels.com/photos/31711944/pexels-photo-31711944/free-photo-of-two-elegant-lattes-on-wooden-cafe-table.jpeg",
  "https://images.pexels.com/photos/5373242/pexels-photo-5373242.jpeg",
  "https://images.pexels.com/photos/13013307/pexels-photo-13013307.jpeg",
  "https://images.pexels.com/photos/13523793/pexels-photo-13523793.jpeg",
  "https://images.pexels.com/photos/7683595/pexels-photo-7683595.jpeg",
  "https://images.pexels.com/photos/4913342/pexels-photo-4913342.jpeg",
  "https://images.pexels.com/photos/26985929/pexels-photo-26985929/free-photo-of-white-cup-of-black-coffee.jpeg",
  "https://images.pexels.com/photos/25409661/pexels-photo-25409661/free-photo-of-espresso-in-glass.jpeg",
  "https://images.pexels.com/photos/31139336/pexels-photo-31139336/free-photo-of-artistic-latte-with-heart-latte-art-on-wooden-table.jpeg",
];

function pexelsId(url: string): string {
  const m = url.match(/photos\/(\d+)\//);
  return m ? m[1] : "unknown";
}

async function download(url: string): Promise<Buffer | null> {
  const res = await fetch(url + SIZED, {
    headers: { "User-Agent": "Mozilla/5.0 (NextPress dev seed)" },
  });
  if (!res.ok) {
    console.warn(`[seed:coffee] skip ${url} — HTTP ${res.status}`);
    return null;
  }
  return Buffer.from(await res.arrayBuffer());
}

async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  const settings = await readMediaSettings(db);

  const mediaIds: string[] = [];
  let n = 0;

  for (const url of CANDIDATES) {
    if (mediaIds.length >= MAX_IMAGES) break;
    const bytes = await download(url);
    if (!bytes) continue;

    const dims = readImageDimensions(bytes);
    if (!dims) {
      console.warn(`[seed:coffee] skip ${pexelsId(url)} — unreadable dimensions`);
      continue;
    }
    if (dims.height <= dims.width) {
      console.warn(
        `[seed:coffee] skip ${pexelsId(url)} — not portrait (${dims.width}x${dims.height})`,
      );
      continue;
    }

    n += 1;
    const filename = `coffee-portrait-${n}.jpg`;
    const result = await uploadMedia(
      db,
      { filename, mime: "image/jpeg", bytes, uploadedBy: null },
      settings,
    );
    if (!result.ok) {
      console.warn(`[seed:coffee] upload failed for ${pexelsId(url)} — ${result.error}`);
      n -= 1;
      continue;
    }

    // Give it a human-friendly alt instead of the synthetic filename.
    await db.execute({
      sql: "UPDATE media SET alt_text = ? WHERE id = ?",
      args: [`Coffee ${n}`, result.media.id],
    });

    mediaIds.push(result.media.id);
    console.log(
      `[seed:coffee] added ${filename} (${dims.width}x${dims.height}) -> ${result.media.id}`,
    );
  }

  if (mediaIds.length === 0) {
    console.error("[seed:coffee] no portrait images ingested — aborting gallery creation");
    process.exit(1);
  }

  // Create (or reuse) the gallery, then attach the ingested media.
  let galleryId: number;
  try {
    galleryId = await createGallery(db, {
      name: GALLERY_NAME,
      slug: GALLERY_SLUG,
      description: "Portrait coffee photos (Pexels) for testing the Masonry gallery layout.",
      createdBy: null,
    });
    console.log(`[seed:coffee] created gallery #${galleryId} "${GALLERY_NAME}"`);
  } catch (err) {
    if (err instanceof GallerySlugConflictError) {
      const existing = await db.execute({
        sql: "SELECT id FROM galleries WHERE tenant_id = 1 AND slug = ? LIMIT 1",
        args: [GALLERY_SLUG],
      });
      galleryId = Number(existing.rows[0]?.id);
      console.log(`[seed:coffee] reusing existing gallery #${galleryId} "${GALLERY_NAME}"`);
    } else {
      throw err;
    }
  }

  const inserted = await addItemsToGallery(db, galleryId, mediaIds);
  console.log(
    `[seed:coffee] DONE — ${mediaIds.length} media ingested, ${inserted} added to gallery #${galleryId}`,
  );
}

main().catch((err) => {
  console.error("[seed:coffee] FAILED:", err);
  process.exit(1);
});
