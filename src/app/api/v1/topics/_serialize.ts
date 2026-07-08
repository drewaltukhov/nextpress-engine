import type { TopicListItem } from "@core-plugins/topics";

export function serializeTopic(t: TopicListItem) {
  return {
    id: t.id,
    name: t.name,
    slug: t.slug,
    description: t.description,
    template: t.template,
    post_count: t.postCount,
    created_at: t.createdAt,
    updated_at: t.updatedAt,
  };
}
