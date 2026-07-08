import type { PostDetail, PostListItem } from "@core-plugins/posts";

/**
 * Build the public URL for a published post. Returns null for drafts and
 * trashed rows so API consumers can tell at a glance whether the row is
 * reachable from the public site.
 */
function buildPostUrl(p: PostListItem): string | null {
  if (p.status !== "published" || p.trashedAt) return null;
  if (p.postKind === "spike") {
    return p.parentSlug ? `/${p.parentSlug}/${p.slug}` : null;
  }
  return `/${p.slug}`;
}

export function serializePostListItem(p: PostListItem) {
  return {
    id: p.id,
    title: p.title,
    slug: p.slug,
    status: p.status,
    post_kind: p.postKind,
    parent_id: p.parentId,
    parent_slug: p.parentSlug,
    parent_title: p.parentTitle,
    published_at: p.publishedAt,
    featured_image: p.featuredImage,
    seo_title: p.seoTitle,
    seo_description: p.seoDescription,
    seo_exclude_from_sitemap: p.seoExcludeFromSitemap,
    created_by: p.createdBy,
    author_display_name: p.authorDisplayName,
    created_at: p.createdAt,
    updated_at: p.updatedAt,
    trashed_at: p.trashedAt,
    url: buildPostUrl(p),
  };
}

export function serializePostDetail(p: PostDetail) {
  return {
    ...serializePostListItem(p),
    content_json: p.contentJson,
    excerpt: p.excerpt,
    seo_og_image: p.seoOgImage,
    seo_canonical: p.seoCanonical,
    seo_robots: p.seoRobots,
    schema_types: p.schemaTypes,
    topic_ids: p.topicIds,
  };
}
