import type { PluginAPI } from "@core/plugins/api";

/**
 * Galleries core-plugin — named, ordered media sets.
 *
 * v1 ships pure CRUD on `galleries` + `gallery_items`. The Puck/Tiptap
 * Gallery block that consumes a gallery by id lands with the Posts/Pages
 * plugins; until then galleries are admin-side groupings only.
 */
export default function register(_api: PluginAPI): void {
  // No settings to register today. Future: default gallery layout (grid /
  // masonry / carousel) and items-per-row land alongside the Gallery block.
}

export {
  listGalleries,
  getGallery,
  createGallery,
  updateGallery,
  deleteGallery,
  addItemsToGallery,
  removeItemFromGallery,
  reorderGalleryItems,
  setGalleryItemCaption,
  GallerySlugConflictError,
  GallerySlugReservedError,
  GalleryNotFoundError,
  type GalleryListItem,
  type GalleryDetail,
  type GalleryItem,
  type CreateGalleryInput,
  type UpdateGalleryInput,
} from "./service";
