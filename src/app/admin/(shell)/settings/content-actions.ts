"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { assertWriteable } from "@core/maintenance";
import { resolveUserId } from "@core/auth/resolve-user";
import { auditLog } from "@core-plugins/logging";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { listPages } from "@core-plugins/pages";
import { listTopics } from "@core-plugins/topics";
import { listPillars } from "@core-plugins/posts";
import {
  setHomepageContentSource,
  type HomepageSourceKind,
} from "@core-plugins/themes/homepage-source-actions";

export type EditorInspectorPosition = "sidebar" | "floating";

export interface ContentSettings {
  editorInspectorPosition: EditorInspectorPosition;
  homeSourceKind: HomepageSourceKind;
  homePageId: number;
  homeTopicId: number;
  homePillarId: number;
  disableRightClick: boolean;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

export interface HomepagePageOption {
  id: number;
  title: string;
  slug: string;
}

export interface HomepageTopicOption {
  id: number;
  name: string;
  slug: string;
}

export interface HomepagePillarOption {
  id: number;
  title: string;
  slug: string;
}

export async function getContentSettings(): Promise<ContentSettings> {
  const [editorInspectorPosition, homeSourceKind, homePageId, homeTopicId, homePillarId, disableRightClick] =
    await Promise.all([
      getSetting<EditorInspectorPosition>(db(), "content.editor_inspector_position"),
      getSetting<HomepageSourceKind>(db(), "content.home_source_kind"),
      getSetting<number>(db(), "content.home_page_id"),
      getSetting<number>(db(), "content.home_topic_id"),
      getSetting<number>(db(), "content.home_pillar_id"),
      getSetting<boolean>(db(), "content.disable_right_click"),
    ]);

  // Derive kind from legacy setting when home_source_kind is unset.
  const resolvedKind: HomepageSourceKind =
    homeSourceKind ?? ((homePageId ?? 0) > 0 ? "page" : "recent");

  return {
    editorInspectorPosition: editorInspectorPosition ?? "sidebar",
    homeSourceKind: resolvedKind,
    homePageId: homePageId ?? 0,
    homeTopicId: homeTopicId ?? 0,
    homePillarId: homePillarId ?? 0,
    disableRightClick: disableRightClick ?? false,
  };
}

/**
 * Published pages for the homepage picker dropdown. Returns title + slug so
 * the Select trigger can show "Title (/slug)" without a second round-trip.
 */
export async function listHomepagePageOptions(): Promise<HomepagePageOption[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!session.user.roles?.includes("admin")) return [];

  const rows = await listPages(db(), { status: "published", view: "live" });
  return rows.map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
}

/**
 * Topics for the homepage topic picker. Flat list, sorted by name.
 */
export async function listHomepageTopicOptions(): Promise<HomepageTopicOption[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!session.user.roles?.includes("admin")) return [];

  const rows = await listTopics(db());
  return rows.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));
}

/**
 * Published pillars for the homepage pillar picker.
 */
export async function listHomepagePillarOptions(): Promise<HomepagePillarOption[]> {
  const session = await auth();
  if (!session?.user?.id) return [];
  if (!session.user.roles?.includes("admin")) return [];

  const rows = await listPillars(db());
  // listPillars returns all non-trashed pillars; filter to published only.
  return rows
    .filter((p) => p.status === "published")
    .map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
}

export async function saveContentSettings(input: ContentSettings): Promise<SaveResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  if (!session.user.roles?.includes("admin")) {
    return { ok: false, error: "Only administrators can change content settings" };
  }
  const guard = await assertWriteable(db());
  if (!guard.ok) return { ok: false, error: guard.error! };

  const userId = await resolveUserId(db(), session.user);
  const opts = { updatedBy: userId };

  try {
    // Write editor position and disable_right_click directly (no extra validation).
    await setSetting(
      db(),
      "content.editor_inspector_position",
      input.editorInspectorPosition,
      opts,
    );
    await setSetting(db(), "content.disable_right_click", input.disableRightClick, opts);

    // Delegate homepage source writes to the canonical writer (validates ids).
    const sourceResult = await setHomepageContentSource({
      kind: input.homeSourceKind,
      pageId: input.homePageId,
      topicId: input.homeTopicId,
      pillarId: input.homePillarId,
    });
    if (!sourceResult.ok) {
      return { ok: false, error: sourceResult.error };
    }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }

  try {
    await auditLog(db(), {
      actorUserId: userId,
      action: "settings.content.update",
      targetType: "settings",
      targetId: "content",
      diff: { ...input },
    });
  } catch {
    // Audit failures must not break the action
  }

  revalidatePath("/admin/settings");
  revalidatePath("/");
  return { ok: true };
}
