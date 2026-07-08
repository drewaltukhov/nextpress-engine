"use client";

import { createContext, useContext } from "react";
import type { GalleryDetail } from "../service";

/**
 * Bridge between the Gallery block's custom field (which lives inside
 * Puck's inspector) and the page editor's gallery-detail cache.
 *
 * - `register(detail)` stashes a freshly-picked gallery so the canvas
 *   preview can render real thumbnails immediately (without waiting for
 *   a separate fetch round-trip).
 * - `getGallery(id)` reads back from the same cache so the picker
 *   field's "currently selected" preview can show the gallery name + cover
 *   thumbnail when an existing page is reopened (the cache is seeded by
 *   the editor on mount from saved puckData).
 */
export interface GalleryRegisterApi {
  register: (detail: GalleryDetail) => void;
  getGallery: (id: number) => GalleryDetail | undefined;
}

export const GalleryRegisterContext = createContext<GalleryRegisterApi | null>(null);

export function useGalleryRegister() {
  return useContext(GalleryRegisterContext);
}
