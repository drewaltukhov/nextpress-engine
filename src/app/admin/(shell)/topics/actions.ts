"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { auditLog } from "@core-plugins/logging";
import { resolveUserId } from "@core/auth/resolve-user";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import {
  listTopics,
  getTopic,
  createTopic,
  updateTopic,
  deleteTopic,
  TopicSlugConflictError,
  TopicSlugReservedError,
  type TopicListItem,
} from "@core-plugins/topics";
import { createAutoRedirect } from "@core-plugins/redirects";

export type SaveResult = { ok: true; id?: number } | { ok: false; error: string };

/**
 * Topics management is gated by the `topics.manage` permission. Admin
 * (`*`) covers it automatically; editor gets it via the 003 users
 * migration; custom roles can grant it via /admin/roles.
 */
async function requireTopicsManageUserId(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const roles = session.user.roles ?? [];
  const perms = await getEffectivePermissions(db(), roles);
  if (!hasPermission(perms, "topics.manage")) {
    return { ok: false, error: "You don't have permission to manage topics" };
  }
  const userId = await resolveUserId(db(), session.user);
  return { ok: true, userId };
}

async function commonGuard(): Promise<
  { ok: true; userId: string } | { ok: false; error: string }
> {
  const guard = await requireTopicsManageUserId();
  if (!guard.ok) return guard;
  const writeable = await assertWriteable(db());
  if (!writeable.ok) return { ok: false, error: writeable.error! };
  return guard;
}

export async function getTopics(): Promise<TopicListItem[]> {
  return listTopics(db());
}

export interface TopicFormInput {
  name: string;
  slug: string;        // empty string = derive from name
  description: string;
  /** Slug of a custom Topic Archive template, or "" for the built-in default. */
  template: string;
}

export async function createTopicAction(input: TopicFormInput): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  let id: number;
  try {
    id = await createTopic(db(), {
      name: input.name,
      slug: input.slug.trim() || undefined,
      description: input.description,
      template: input.template,
      createdBy: guard.userId,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "topics.created",
      targetType: "topic",
      targetId: String(id),
      diff: {
        name: input.name.trim(),
        slug: input.slug.trim() || undefined,
        description: input.description.trim() || null,
        template: input.template.trim() || null,
      },
    });
  } catch {
    // Audit failures must not break the action.
  }

  revalidatePath("/admin/topics");
  return { ok: true, id };
}

export async function updateTopicAction(
  id: number,
  input: TopicFormInput,
): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  const before = await getTopic(db(), id);

  try {
    await updateTopic(db(), id, {
      name: input.name,
      slug: input.slug.trim() || undefined,
      description: input.description,
      template: input.template,
    });
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "topics.updated",
      targetType: "topic",
      targetId: String(id),
      diff: {
        name: input.name.trim(),
        slug: input.slug.trim() || undefined,
        description: input.description.trim() || null,
        template: input.template.trim() || null,
      },
    });
  } catch {
    // Audit failures must not break the action.
  }

  // Auto-redirect on slug change. Topic archives live at /topics/<slug>.
  try {
    if (before) {
      const after = await getTopic(db(), id);
      if (after && before.slug !== after.slug) {
        await createAutoRedirect(db(), {
          fromPath: `/topics/${before.slug}`,
          toPath: `/topics/${after.slug}`,
          source: "slug_change",
          createdBy: guard.userId,
        });
      }
    }
  } catch { /* redirect creation non-fatal */ }

  revalidatePath("/admin/topics");
  return { ok: true, id };
}

export async function deleteTopicAction(id: number): Promise<SaveResult> {
  const guard = await commonGuard();
  if (!guard.ok) return guard;

  try {
    await deleteTopic(db(), id);
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }

  try {
    await auditLog(db(), {
      actorUserId: guard.userId,
      action: "topics.deleted",
      targetType: "topic",
      targetId: String(id),
    });
  } catch {
    // Audit failures must not break the action.
  }

  revalidatePath("/admin/topics");
  return { ok: true };
}

function errorMessage(err: unknown): string {
  if (err instanceof TopicSlugConflictError) return err.message;
  if (err instanceof TopicSlugReservedError) return err.message;
  return err instanceof Error ? err.message : "Save failed";
}
