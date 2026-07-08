import { NextResponse, type NextRequest } from "next/server";
import { withBearerAuth, getApiContext } from "@core-plugins/api/bearer";
import { db } from "@core/db/instance";
import { auditLog } from "@core-plugins/logging";
import {
  getTopic,
  updateTopic,
  deleteTopic,
  TopicSlugConflictError,
  TopicSlugReservedError,
  type UpdateTopicInput,
} from "@core-plugins/topics";
import { serializeTopic } from "../_serialize";

function jsonError(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message } }, { status });
}

function readId(req: NextRequest): number | null {
  const segments = req.nextUrl.pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1];
  const id = Number(last);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function getHandler(req: NextRequest) {
  const id = readId(req);
  if (id == null) return jsonError("not_found", "Topic not found", 404);
  const topic = await getTopic(db(), id);
  if (!topic) return jsonError("not_found", "Topic not found", 404);
  return NextResponse.json({ data: serializeTopic(topic) });
}

async function patchHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;
  const id = readId(req);
  if (id == null) return jsonError("not_found", "Topic not found", 404);

  const existing = await getTopic(db(), id);
  if (!existing) return jsonError("not_found", "Topic not found", 404);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return jsonError("invalid_body", "Request body must be valid JSON", 400);
  }
  if (!body || typeof body !== "object") {
    return jsonError("invalid_body", "Request body must be a JSON object", 400);
  }

  const upd: UpdateTopicInput = {};

  if ("name" in body) {
    if (typeof body.name !== "string") {
      return jsonError("validation_error", "name must be a string", 400);
    }
    upd.name = body.name;
  }

  if ("slug" in body) {
    if (typeof body.slug !== "string") {
      return jsonError("validation_error", "slug must be a string", 400);
    }
    upd.slug = body.slug;
  }

  if ("description" in body) {
    if (body.description !== null && typeof body.description !== "string") {
      return jsonError("validation_error", "description must be a string or null", 400);
    }
    upd.description = body.description as string | null;
  }

  if ("template" in body) {
    if (body.template !== null && typeof body.template !== "string") {
      return jsonError("validation_error", "template must be a string or null", 400);
    }
    upd.template = body.template as string | null;
  }

  if (Object.keys(upd).length > 0) {
    try {
      await updateTopic(db(), id, upd);
    } catch (err) {
      if (err instanceof TopicSlugConflictError) return jsonError("slug_conflict", err.message, 409);
      if (err instanceof TopicSlugReservedError) return jsonError("slug_reserved", err.message, 409);
      return jsonError("validation_error", err instanceof Error ? err.message : "Update failed", 400);
    }
  }

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "topic.update",
    targetType: "topic",
    targetId: String(id),
    diff: { fields: Object.keys(body) },
  }).catch(() => {});

  const updated = await getTopic(db(), id);
  if (!updated) return jsonError("not_found", "Topic not found", 404);
  return NextResponse.json({ data: serializeTopic(updated) });
}

async function deleteHandler(req: NextRequest) {
  const ctx = getApiContext(req)!;
  const id = readId(req);
  if (id == null) return jsonError("not_found", "Topic not found", 404);

  const existing = await getTopic(db(), id);
  if (!existing) return jsonError("not_found", "Topic not found", 404);

  try {
    await deleteTopic(db(), id);
  } catch (err) {
    return jsonError("internal_error", err instanceof Error ? err.message : "Delete failed", 500);
  }

  void auditLog(db(), {
    actorUserId: ctx.userId,
    actorTokenId: ctx.token.id,
    action: "topic.delete",
    targetType: "topic",
    targetId: String(id),
    diff: { name: existing.name, slug: existing.slug },
  }).catch(() => {});

  return NextResponse.json({ data: { id, deleted: true } });
}

export const GET = withBearerAuth({ scopes: ["taxonomies:read"] }, getHandler);
export const PATCH = withBearerAuth({ scopes: ["taxonomies:write"] }, patchHandler);
export const DELETE = withBearerAuth({ scopes: ["taxonomies:write"] }, deleteHandler);
