import sharp from "sharp";

const THUMB_MAX_WIDTH = 600;
const THUMB_QUALITY = 75;
const THUMB_MIME = "image/webp";
const MEDIUM_MAX_WIDTH = 1280;
const MEDIUM_QUALITY = 80;
const MEDIUM_MIME = "image/webp";
const COMPACT_QUALITY = 90;
const ORIGINAL_MAX_LONG_EDGE = 1920;
const ORIGINAL_QUALITY = 90;

export interface ThumbResult {
  data: Buffer;
  mime: string;
}

export interface MediumResult {
  data: Buffer;
  mime: string;
}

export interface CompactResult {
  data: Buffer;
}

/**
 * Re-encode a JPEG / BMP buffer as WebP at high quality, baking in EXIF
 * orientation. Returns null on failure so the caller can fall back to
 * storing the original.
 */
export async function compactToWebp(buf: Buffer | Uint8Array): Promise<CompactResult | null> {
  try {
    const out = await sharp(buf, { failOn: "none" })
      .rotate()
      .webp({ quality: COMPACT_QUALITY })
      .toBuffer();
    return { data: out };
  } catch {
    return null;
  }
}

export interface ResizeOriginalResult {
  data: Buffer;
}

/**
 * Cap the uploaded original at a max longest-edge dimension (default 1920px)
 * while preserving aspect ratio. Both landscape and portrait orientations are
 * handled by Sharp's `fit: 'inside'` — images smaller than the cap pass
 * through untouched thanks to `withoutEnlargement`.
 *
 * Re-encodes in the input's format at quality 90 (matching `COMPACT_QUALITY`).
 * Caller is responsible for SVG-skip — this function assumes a raster image
 * and returns `null` on any Sharp failure so the caller can fall back to the
 * pre-resize buffer.
 */
export async function resizeOriginal(
  buf: Buffer | Uint8Array,
  mime: string,
  maxLongEdge: number = ORIGINAL_MAX_LONG_EDGE
): Promise<ResizeOriginalResult | null> {
  try {
    let pipeline = sharp(buf, { failOn: "none" })
      .rotate()
      .resize({
        width: maxLongEdge,
        height: maxLongEdge,
        fit: "inside",
        withoutEnlargement: true,
      });

    // Preserve format. The caller has already run compactToWebp on JPEG/BMP,
    // so the most common inputs at this stage are WebP and PNG.
    if (mime === "image/webp") {
      pipeline = pipeline.webp({ quality: ORIGINAL_QUALITY });
    } else if (mime === "image/png") {
      pipeline = pipeline.png();
    } else if (mime === "image/jpeg") {
      pipeline = pipeline.jpeg({ quality: ORIGINAL_QUALITY });
    } else if (mime === "image/avif") {
      pipeline = pipeline.avif({ quality: 75 });
    } else if (mime === "image/gif") {
      pipeline = pipeline.gif();
    }
    // Unknown raster format → use Sharp's default for the input.

    const out = await pipeline.toBuffer();
    return { data: out };
  } catch {
    return null;
  }
}

/**
 * Generate a small WebP thumbnail (max 600px wide, preserving aspect ratio)
 * from an image buffer. Returns null on unsupported formats — callers store
 * the row without a thumb and the serve route falls back to the original.
 *
 * SVG: skipped intentionally. SVG is vector — the original IS the thumbnail.
 * Caller can detect mime === "image/svg+xml" and skip this entirely.
 */
export async function generateThumbnail(buf: Buffer | Uint8Array): Promise<ThumbResult | null> {
  try {
    const out = await sharp(buf, { failOn: "none" })
      .rotate() // honor EXIF orientation
      .resize({ width: THUMB_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: THUMB_QUALITY })
      .toBuffer();
    return { data: out, mime: THUMB_MIME };
  } catch {
    return null;
  }
}

/**
 * Generate a medium-sized WebP (max 1280px wide, preserving aspect ratio)
 * for use in mid-bleed render surfaces — carousel slides, hero variants,
 * featured-image inline crops on wide layouts. Returns null on unsupported
 * formats; callers store the row without a medium variant and the serve
 * route falls back to the original.
 *
 * The 1280px target is tuned for max-w-3xl containers (768px CSS) at
 * 2× retina (1536px), but biased a notch smaller to keep bandwidth in
 * check on personal-scale sites. SVG is skipped for the same reason as
 * thumb — vector originals don't need a raster reduction.
 */
export async function generateMedium(buf: Buffer | Uint8Array): Promise<MediumResult | null> {
  try {
    const out = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize({ width: MEDIUM_MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: MEDIUM_QUALITY })
      .toBuffer();
    return { data: out, mime: MEDIUM_MIME };
  } catch {
    return null;
  }
}
