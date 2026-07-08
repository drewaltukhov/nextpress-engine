/**
 * Thumbnail-size config for the Media Library grid. Plain shared module
 * (no `"use client"`) so both the server page and the client tabs can
 * import the cookie name and the responsive grid-cols presets.
 *
 * Levels go from 0 (largest tiles, fewest columns) to 4 (smallest tiles,
 * most columns). Level 2 is the legacy default (2/3/4/5 across breakpoints).
 */
export const THUMB_SIZE_LEVELS = [
  "grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3",
  "grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4",
  "grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5",
  "grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7",
  "grid-cols-4 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10",
] as const;

export const DEFAULT_THUMB_SIZE_LEVEL = 2;
export const THUMB_SIZE_COOKIE = "np_media_thumb_size";

export function clampThumbSize(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_THUMB_SIZE_LEVEL;
  if (value < 0) return 0;
  if (value > THUMB_SIZE_LEVELS.length - 1) return THUMB_SIZE_LEVELS.length - 1;
  return value;
}
