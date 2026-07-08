import { NextResponse, type NextRequest } from "next/server";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import {
  listPosts,
  createPost,
  getPost,
  PostSlugConflictError,
  PostSlugReservedError,
  PostParentInvalidError,
  POST_KINDS,
  POST_STATUSES,
  type PostKind,
  type PostStatus,
  type ListPostsFilters,
  type PostView,
  type CreatePostInput,
} from "@core-plugins/posts";
import { serializePostDetail, serializePostListItem } from "./_serialize";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function parseTopicIds(raw: string | null): number[] | undefined {
  if (!raw) return undefined;
  const ids = raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);
  return ids.length > 0 ? ids : undefined;
}

function isPostKind(v: unknown): v is PostKind {
  return typeof v === "string" && (POST_KINDS as readonly string[]).includes(v);
}

function isPostStatus(v: unknown): v is PostStatus {
  return typeof v === "string" && (POST_STATUSES as readonly string[]).includes(v);
}

function asOptString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string") return v;
  return undefined;
}

function asOptNumber(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return undefined;
}

async function listHandler(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams;

  const view = q.get("view");
  const status = q.get("status");
  const kind = q.get("kind");

  const filters: ListPostsFilters = {
    view: view === "trash" ? "trash" : ("live" as PostView),
    search: q.get("search") ?? undefined,
    dateFrom: q.get("date_from") ?? undefined,
    dateTo: q.get("date_to") ?? undefined,
    authorId: q.get("author_id") ?? undefined,
    topicIds: parseTopicIds(q.get("topic_ids")),
  };
  if (status === "all" || isPostStatus(status)) filters.status = status;
  if (kind === "all" || isPostKind(kind)) filters.kind = kind;
  const pillarParam = q.get("pillar_id");
  if (pillarParam) {
    const n = Number(pillarParam);
    if (Number.isFinite(n) && n > 0) filters.pillarId = n;
  }

  const page = Math.max(1, Number(q.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.get("page_size") ?? "50") || 50));

  const all = await listPosts(db(), filters);
  const total = all.length;
  const start = (page - 1) * pageSize;
  const slice = all.slice(start, start + pageSize);

  return NextResponse.json({
    data: slice.map(serializePostListItem),
    meta: { page, page_size: pageSize, total },
  });
}

async function createHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalid_body", "Request body must be valid JSON", 400);
  }
  if (!body || typeof body !== "object") {
    return jsonError("invalid_body", "Request body must be a JSON object", 400);
  }

  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) return jsonError("validation_error", "title is required", 400);

  const status = body.status;
  if (status !== undefined && !isPostStatus(status)) {
    return jsonError("validation_error", `status must be one of: ${POST_STATUSES.join(", ")}`, 400);
  }
  const postKind = body.post_kind;
  if (postKind !== undefined && !isPostKind(postKind)) {
    return jsonError("validation_error", `post_kind must be one of: ${POST_KINDS.join(", ")}`, 400);
  }

  let topicIds: number[] | undefined;
  if (Array.isArray(body.topic_ids)) {
    topicIds = body.topic_ids
      .map((v) => Number(v))
      .filter((n) => Number.isFinite(n) && n > 0);
  } else if (body.topic_ids !== undefined) {
    return jsonError("validation_error", "topic_ids must be an array of numbers", 400);
  }

  let schemaTypes: string[] | undefined;
  if (Array.isArray(body.schema_types)) {
    schemaTypes = body.schema_types.filter((x): x is string => typeof x === "string");
  } else if (body.schema_types !== undefined) {
    return jsonError("validation_error", "schema_types must be an array of strings", 400);
  }

  const slug = asOptString(body.slug);
  const excerpt = asOptString(body.excerpt);
  const featuredImage = asOptString(body.featured_image);
  const parentId = asOptNumber(body.parent_id);

  if (slug === undefined && body.slug !== undefined) {
    return jsonError("validation_error", "slug must be a string", 400);
  }

  const input: CreatePostInput = {
    title,
    slug: slug ?? undefined,
    excerpt: excerpt ?? undefined,
    status: status as PostStatus | undefined,
    postKind: postKind as PostKind | undefined,
    parentId: parentId ?? undefined,
    featuredImage: featuredImage ?? undefined,
    schemaTypes,
    topicIds,
    createdBy: ctx.userId,
  };

  let id: number;
  try {
    id = await createPost(db(), input);
  } catch (err) {
    if (err instanceof PostSlugConflictError) return jsonError("slug_conflict", err.message, 409);
    if (err instanceof PostSlugReservedError) return jsonError("slug_reserved", err.message, 409);
    if (err instanceof PostParentInvalidError) return jsonError("invalid_parent", err.message, 400);
    return jsonError("validation_error", err instanceof Error ? err.message : "Create failed", 400);
  }

  // Optional content_json on create — the service's CreatePostInput doesn't
  // include it, so apply it via updatePost in the same request.
  if (typeof body.content_json === "string" || body.content_json === null) {
    const { updatePost } = await import("@core-plugins/posts");
    await updatePost(db(), id, { contentJson: body.content_json as string | null });
  }

  // Audit fire-and-forget — don't fail the request if logging blows up.
  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "post.create",
    targetType: "post",
    targetId: String(id),
    diff: { title, status: input.status ?? "draft", post_kind: input.postKind ?? "standalone" },
  }).catch(() => {});

  const created = await getPost(db(), id);
  if (!created) return jsonError("internal_error", "Created post could not be loaded", 500);

  return NextResponse.json({ data: serializePostDetail(created) }, { status: 201 });
}

export const GET = withBearerAuth({ scopes: ["posts:read"] }, listHandler);
export const POST = withBearerAuth({ scopes: ["posts:write"] }, createHandler);
