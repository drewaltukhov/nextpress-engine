import type { PluginAPI } from "@core/plugins/api";

/**
 * Pages core-plugin — admin CRUD + SEO metadata for pages.
 *
 * v1 ships data + admin list / metadata edit; the rich content editor and
 * the public `/{slug}` render route land alongside the editor work.
 */
export default function register(_api: PluginAPI): void {
  // No settings to register today.
}

export {
  listPages,
  getPage,
  getPublishedPageBySlug,
  listAuthors,
  createPage,
  updatePage,
  updatePageSeo,
  setPageStatus,
  deletePage,
  duplicatePage,
  trashPage,
  restorePage,
  forceDeletePage,
  purgeOldTrash,
  getPageOwner,
  getPageTitle,
  PageSlugConflictError,
  PageSlugReservedError,
  PageNotFoundError,
  type PageListItem,
  type PageDetail,
  type AuthorSummary,
  type ListPagesFilters,
  type CreatePageInput,
  type UpdatePageInput,
  type UpdatePageSeoInput,
  type PageView,
} from "./service";

export {
  PAGE_STATUSES,
  PAGE_ROBOTS,
  type PageStatus,
  type PageRobots,
} from "./schema/pages";
