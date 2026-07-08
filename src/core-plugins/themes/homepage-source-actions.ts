"use server";

import { db } from "@core/db/instance";
import { auth } from "@core/auth";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getSetting, setSetting } from "@core-plugins/settings/registry";
import { getPage } from "@core-plugins/pages";
import { getPost } from "@core-plugins/posts";
import { getTopic } from "@core-plugins/topics";

export type HomepageSourceKind = "page" | "recent" | "topic" | "pillar";

export interface HomepageSource {
  kind: HomepageSourceKind;
  page: { id: number; title: string; slug: string } | null;
  topic: { id: number; name: string; slug: string } | null;
  pillar: { id: number; title: string; slug: string } | null;
}

/**
 * Read the current homepage source from settings, resolving any
 * referenced page / topic / pillar to make sure it still exists. If
 * the chosen entity is missing or unpublished, falls back to "recent"
 * so the public site keeps rendering.
 *
 * Backwards-compat: when `content.home_source_kind` is unset, infer
 * from `content.home_page_id` (the legacy setting): id > 0 → "page",
 * else → "recent".
 */
export async function getHomepageContentSource(): Promise<HomepageSource> {
  const [storedKind, pageId, topicId, pillarId] = await Promise.all([
    getSetting<HomepageSourceKind>(db(), "content.home_source_kind"),
    getSetting<number>(db(), "content.home_page_id"),
    getSetting<number>(db(), "content.home_topic_id"),
    getSetting<number>(db(), "content.home_pillar_id"),
  ]);

  const kindFromStored: HomepageSourceKind | undefined = storedKind;
  const inferredKind: HomepageSourceKind =
    kindFromStored ?? ((pageId ?? 0) > 0 ? "page" : "recent");

  const empty: HomepageSource = {
    kind: "recent",
    page: null,
    topic: null,
    pillar: null,
  };

  if (inferredKind === "page") {
    const id = pageId ?? 0;
    if (id > 0) {
      const page = await getPage(db(), id);
      if (page && page.status === "published" && !page.trashedAt) {
        return {
          kind: "page",
          page: { id: page.id, title: page.title, slug: page.slug },
          topic: null,
          pillar: null,
        };
      }
    }
    return empty;
  }

  if (inferredKind === "topic") {
    const id = topicId ?? 0;
    if (id > 0) {
      const topic = await getTopic(db(), id);
      if (topic) {
        return {
          kind: "topic",
          page: null,
          topic: { id: topic.id, name: topic.name, slug: topic.slug },
          pillar: null,
        };
      }
    }
    return empty;
  }

  if (inferredKind === "pillar") {
    const id = pillarId ?? 0;
    if (id > 0) {
      const post = await getPost(db(), id);
      if (
        post &&
        post.postKind === "pillar" &&
        post.status === "published" &&
        !post.trashedAt
      ) {
        return {
          kind: "pillar",
          page: null,
          topic: null,
          pillar: { id: post.id, title: post.title, slug: post.slug },
        };
      }
    }
    return empty;
  }

  // kind === "recent"
  return empty;
}

export interface SetHomepageContentSourceInput {
  kind: HomepageSourceKind;
  pageId?: number;
  topicId?: number;
  pillarId?: number;
}

export type SetHomepageSourceResult = { ok: true } | { ok: false; error: string };

/**
 * Write the homepage source. Permissioned: only users with
 * `themes.manage` may toggle this (matches the rest of the theme
 * settings surface). Always writes the kind plus the matching id —
 * the other ids are cleared to 0 so the data stays tidy.
 */
export async function setHomepageContentSource(
  input: SetHomepageContentSourceInput,
): Promise<SetHomepageSourceResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "themes.manage")) {
    return { ok: false, error: "You don't have permission to change homepage settings" };
  }

  let pageId = 0;
  let topicId = 0;
  let pillarId = 0;

  if (input.kind === "page") {
    if (!input.pageId || input.pageId <= 0) {
      return { ok: false, error: "Pick a page first" };
    }
    const page = await getPage(db(), input.pageId);
    if (!page || page.status !== "published" || page.trashedAt) {
      return { ok: false, error: "That page isn't published" };
    }
    pageId = page.id;
  } else if (input.kind === "topic") {
    if (!input.topicId || input.topicId <= 0) {
      return { ok: false, error: "Pick a topic first" };
    }
    const topic = await getTopic(db(), input.topicId);
    if (!topic) return { ok: false, error: "That topic doesn't exist" };
    topicId = topic.id;
  } else if (input.kind === "pillar") {
    if (!input.pillarId || input.pillarId <= 0) {
      return { ok: false, error: "Pick a pillar first" };
    }
    const post = await getPost(db(), input.pillarId);
    if (
      !post ||
      post.postKind !== "pillar" ||
      post.status !== "published" ||
      post.trashedAt
    ) {
      return { ok: false, error: "That pillar isn't published" };
    }
    pillarId = post.id;
  }

  const opts = { updatedBy: session.user.id };
  await setSetting(db(), "content.home_source_kind", input.kind, opts);
  await setSetting(db(), "content.home_page_id", pageId, opts);
  await setSetting(db(), "content.home_topic_id", topicId, opts);
  await setSetting(db(), "content.home_pillar_id", pillarId, opts);

  return { ok: true };
}
