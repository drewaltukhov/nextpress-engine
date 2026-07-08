import type { PluginAPI } from "@core/plugins/api";

/**
 * Posts core-plugin — admin CRUD, pillar/spike taxonomy, topic tagging,
 * featured image, public renderers at `/<slug>` (pillar/standalone) and
 * `/<pillarSlug>/<spikeSlug>`.
 */
export default function register(_api: PluginAPI): void {
  // No settings to register today.
}

export {
  listPosts,
  listTopicIdsForPosts,
  getPost,
  getPublishedRootPostBySlug,
  getPublishedSpikeBySlug,
  listAuthors,
  listPillars,
  createPost,
  updatePost,
  updatePostSeo,
  setPostStatus,
  setPostTopics,
  deletePost,
  duplicatePost,
  trashPost,
  restorePost,
  forceDeletePost,
  purgeOldTrash,
  getPostOwner,
  getPostTitle,
  countSpikesForPillar,
  countAllPublishedPosts,
  countPublishedPostsInTopic,
  PostSlugConflictError,
  PostSlugReservedError,
  PostNotFoundError,
  PostParentInvalidError,
  type PostListItem,
  type PostDetail,
  type AuthorSummary,
  type PillarOption,
  type ListPostsFilters,
  type CreatePostInput,
  type UpdatePostInput,
  type UpdatePostSeoInput,
  type PostView,
} from "./service";

export {
  POST_STATUSES,
  POST_KINDS,
  POST_ROBOTS,
  type PostStatus,
  type PostKind,
  type PostRobots,
} from "./schema/posts";

export { loadAvailablePillars, type AvailablePillar } from "./picker-actions";
