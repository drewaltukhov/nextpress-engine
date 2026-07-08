import type { PluginAPI } from "@core/plugins/api";

/**
 * Topics core-plugin — flat-tag taxonomy.
 *
 * v1 ships pure CRUD on the `topics` table; the relational half (assigning
 * topics to posts) lands with the Posts plugin and will maintain
 * `post_count` via app-layer increment/decrement on assign.
 */
export default function register(_api: PluginAPI): void {
  // No settings to register today. Future: default ordering, archive prefix.
}

export {
  listTopics,
  getTopic,
  getTopicBySlug,
  createTopic,
  updateTopic,
  deleteTopic,
  TopicSlugConflictError,
  TopicSlugReservedError,
  type TopicListItem,
  type CreateTopicInput,
  type UpdateTopicInput,
} from "./service";

export { loadAvailableTopics, type AvailableTopic } from "./picker-actions";
