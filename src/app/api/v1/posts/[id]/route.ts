import { NextResponse, type NextRequest } from "next/server";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import {
  getPost,
  updatePost,
  updatePostSeo,
  setPostStatus,
  trashPost,
  forceDeletePost,
  PostSlugConflictError,
  PostSlugReservedError,
  PostParentInvalidError,
  PostNotFoundError,
  POST_KINDS,
  POST_STATUSES,
  POST_ROBOTS,
  type PostKind,
  type PostStatus,
  type PostRobots,
  type UpdatePostInput,
  type UpdatePostSeoInput,
} from "@core-plugins/posts";
import { serializePostDetail } from "../_serialize";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function readId(req: NextRequest): number | null {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const id = Number(last);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function isPostKind(v: unknown): v is PostKind {
  return typeof v === "string" && (POST_KINDS as readonly string[]).includes(v);
}

function isPostStatus(v: unknown): v is PostStatus {
  return typeof v === "string" && (POST_STATUSES as readonly string[]).includes(v);
}

function isPostRobots(v: unknown): v is PostRobots {
  return typeof v === "string" && (POST_ROBOTS as readonly string[]).includes(v);
}

async function getHandler(req: NextRequest) {
  const id = readId(req);
  if (id == null) return jsonError("not_found", "Post not found", 404);
  const post = await getPost(db(), id);
  if (!post) return jsonError("not_found", "Post not found", 404);
  return NextResponse.json({ data: serializePostDetail(post) });
}

async function patchHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;
  const id = readId(req);
  if (id == null) return jsonError("not_found", "Post not found", 404);

  const existing = await getPost(db(), id);
  if (!existing) return jsonError("not_found", "Post not found", 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalid_body", "Request body must be valid JSON", 400);
  }
  if (!body || typeof body !== "object") {
    return jsonError("invalid_body", "Request body must be a JSON object", 400);
  }

  // Status transitions go through setPostStatus so published_at gets stamped
  // exactly once. We extract the status here and route the rest through the
  // generic update path.
  if ("status" in body) {
    const next = body.status;
    if (!isPostStatus(next)) {
      return jsonError("validation_error", `status must be one of: ${POST_STATUSES.join(", ")}`, 400);
    }
    try {
      await setPostStatus(db(), id, next);
    } catch (err) {
      return jsonError("validation_error", err instanceof Error ? err.message : "Status update failed", 400);
    }
  }

  // Validate + collect content/structure fields for updatePost.
  const upd: UpdatePostInput = {};
  if ("title" in body) {
    if (typeof body.title !== "string") {
      return jsonError("validation_error", "title must be a string", 400);
    }
    upd.title = body.title;
  }
  if ("slug" in body) {
    if (body.slug !== null && typeof body.slug !== "string") {
      return jsonError("validation_error", "slug must be a string", 400);
    }
    if (typeof body.slug === "string") upd.slug = body.slug;
  }
  if ("content_json" in body) {
    if (body.content_json !== null && typeof body.content_json !== "string") {
      return jsonError("validation_error", "content_json must be a string or null", 400);
    }
    upd.contentJson = body.content_json as string | null;
  }
  if ("excerpt" in body) {
    if (body.excerpt !== null && typeof body.excerpt !== "string") {
      return jsonError("validation_error", "excerpt must be a string or null", 400);
    }
    upd.excerpt = body.excerpt as string | null;
  }
  if ("featured_image" in body) {
    if (body.featured_image !== null && typeof body.featured_image !== "string") {
      return jsonError("validation_error", "featured_image must be a string or null", 400);
    }
    upd.featuredImage = body.featured_image as string | null;
  }
  if ("post_kind" in body) {
    if (!isPostKind(body.post_kind)) {
      return jsonError("validation_error", `post_kind must be one of: ${POST_KINDS.join(", ")}`, 400);
    }
    upd.postKind = body.post_kind;
  }
  if ("parent_id" in body) {
    if (body.parent_id !== null && (typeof body.parent_id !== "number" || !Number.isFinite(body.parent_id))) {
      return jsonError("validation_error", "parent_id must be a number or null", 400);
    }
    upd.parentId = body.parent_id as number | null;
  }
  if ("schema_types" in body) {
    if (!Array.isArray(body.schema_types)) {
      return jsonError("validation_error", "schema_types must be an array", 400);
    }
    upd.schemaTypes = body.schema_types.filter((x): x is string => typeof x === "string");
  }
  if ("topic_ids" in body) {
    if (!Array.isArray(body.topic_ids)) {
      return jsonError("validation_error", "topic_ids must be an array", 400);
    }
    upd.topicIds = body.topic_ids
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  }

  if (Object.keys(upd).length > 0) {
    try {
      await updatePost(db(), id, upd);
    } catch (err) {
      if (err instanceof PostSlugConflictError) return jsonError("slug_conflict", err.message, 409);
      if (err instanceof PostSlugReservedError) return jsonError("slug_reserved", err.message, 409);
      if (err instanceof PostParentInvalidError) return jsonError("invalid_parent", err.message, 400);
      if (err instanceof PostNotFoundError) return jsonError("not_found", err.message, 404);
      return jsonError("validation_error", err instanceof Error ? err.message : "Update failed", 400);
    }
  }

  // SEO fields use a separate service fn — collect any that were provided
  // and apply them in one call.
  const seo: UpdatePostSeoInput = {};
  if ("seo_title" in body) seo.seoTitle = (body.seo_title as string | null) ?? null;
  if ("seo_description" in body) seo.seoDescription = (body.seo_description as string | null) ?? null;
  if ("seo_og_image" in body) seo.seoOgImage = (body.seo_og_image as string | null) ?? null;
  if ("seo_canonical" in body) seo.seoCanonical = (body.seo_canonical as string | null) ?? null;
  if ("seo_robots" in body) {
    if (!isPostRobots(body.seo_robots)) {
      return jsonError("validation_error", `seo_robots must be one of: ${POST_ROBOTS.join(", ")}`, 400);
    }
    seo.seoRobots = body.seo_robots;
  }
  if ("seo_exclude_from_sitemap" in body) {
    if (typeof body.seo_exclude_from_sitemap !== "boolean") {
      return jsonError("validation_error", "seo_exclude_from_sitemap must be boolean", 400);
    }
    seo.seoExcludeFromSitemap = body.seo_exclude_from_sitemap;
  }
  if (Object.keys(seo).length > 0) {
    try {
      await updatePostSeo(db(), id, seo);
    } catch (err) {
      return jsonError("validation_error", err instanceof Error ? err.message : "SEO update failed", 400);
    }
  }

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "post.update",
    targetType: "post",
    targetId: String(id),
    diff: { fields: Object.keys(body) },
  }).catch(() => {});

  const updated = await getPost(db(), id);
  if (!updated) return jsonError("not_found", "Post not found", 404);
  return NextResponse.json({ data: serializePostDetail(updated) });
}

async function deleteHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;
  const id = readId(req);
  if (id == null) return jsonError("not_found", "Post not found", 404);

  const url = new URL(req.url);
  const force = url.searchParams.get("force") === "true" || url.searchParams.get("force") === "1";

  const existing = await getPost(db(), id);
  if (!existing) return jsonError("not_found", "Post not found", 404);

  try {
    if (force) {
      await forceDeletePost(db(), id);
    } else {
      await trashPost(db(), id);
    }
  } catch (err) {
    return jsonError("internal_error", err instanceof Error ? err.message : "Delete failed", 500);
  }

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: force ? "post.force_delete" : "post.trash",
    targetType: "post",
    targetId: String(id),
    diff: { title: existing.title },
  }).catch(() => {});

  return NextResponse.json({ data: { id, deleted: true, force } });
}

export const GET = withBearerAuth({ scopes: ["posts:read"] }, getHandler);
export const PATCH = withBearerAuth({ scopes: ["posts:write"] }, patchHandler);
export const DELETE = withBearerAuth({ scopes: ["posts:delete"] }, deleteHandler);
