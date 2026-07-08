import { imageSize } from "image-size";

/**
 * Read width/height from an image buffer without decoding the full image.
 * Returns null if the buffer isn't a recognized image format — callers
 * still store the file but skip the dimension columns.
 */
export function readImageDimensions(buf: Buffer | Uint8Array): { width: number; height: number } | null {
  try {
    const result = imageSize(buf);
    if (typeof result.width === "number" && typeof result.height === "number") {
      return { width: result.width, height: result.height };
    }
    return null;
  } catch {
    return null;
  }
}
