import { NextResponse, type NextRequest } from "next/server";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import {
  listTopics,
  createTopic,
  getTopic,
  TopicSlugConflictError,
  TopicSlugReservedError,
  type CreateTopicInput,
} from "@core-plugins/topics";
import { serializeTopic } from "./_serialize";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function asOptString(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v === "string") return v;
  return undefined;
}

async function listHandler(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams;

  const search = q.get("search")?.trim().toLowerCase() ?? "";
  const page = Math.max(1, Number(q.get("page") ?? "1") || 1);
  const pageSize = Math.min(100, Math.max(1, Number(q.get("page_size") ?? "50") || 50));

  const all = await listTopics(db());
  const filtered = search
    ? all.filter(
        (t) =>
          t.name.toLowerCase().includes(search) ||
          t.slug.toLowerCase().includes(search) ||
          (t.description?.toLowerCase().includes(search) ?? false),
      )
    : all;
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return NextResponse.json({
    data: slice.map(serializeTopic),
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return jsonError("validation_error", "name is required", 400);

  const slug = asOptString(body.slug);
  if (slug === undefined && body.slug !== undefined) {
    return jsonError("validation_error", "slug must be a string", 400);
  }

  const description = asOptString(body.description);
  if (description === undefined && body.description !== undefined) {
    return jsonError("validation_error", "description must be a string or null", 400);
  }

  const template = asOptString(body.template);
  if (template === undefined && body.template !== undefined) {
    return jsonError("validation_error", "template must be a string or null", 400);
  }

  const input: CreateTopicInput = {
    name,
    slug: slug ?? undefined,
    description: description ?? null,
    template: template ?? null,
    createdBy: ctx.userId,
  };

  let id: number;
  try {
    id = await createTopic(db(), input);
  } catch (err) {
    if (err instanceof TopicSlugConflictError) return jsonError("slug_conflict", err.message, 409);
    if (err instanceof TopicSlugReservedError) return jsonError("slug_reserved", err.message, 409);
    return jsonError("validation_error", err instanceof Error ? err.message : "Create failed", 400);
  }

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "topic.create",
    targetType: "topic",
    targetId: String(id),
    diff: { name, slug: input.slug ?? null },
  }).catch(() => {});

  const created = await getTopic(db(), id);
  if (!created) return jsonError("internal_error", "Created topic could not be loaded", 500);

  return NextResponse.json({ data: serializeTopic(created) }, { status: 201 });
}

export const GET = withBearerAuth({ scopes: ["taxonomies:read"] }, listHandler);
export const POST = withBearerAuth({ scopes: ["taxonomies:write"] }, createHandler);
