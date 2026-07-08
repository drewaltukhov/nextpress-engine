"use server";

import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listPages } from "@core-plugins/pages";
import { listPosts } from "@core-plugins/posts";
import { listTopics } from "@core-plugins/topics";

export interface PickerOption {
  id: number;
  label: string;
  /** Pre-built public path for preview / convenience labelling. */
  url: string;
}

export interface PillarPickerOption extends PickerOption {
  /** Published spikes hanging off this pillar, in publish order — the
   *  Add menu item dialog renders these as child menu entries when the
   *  user picks a pillar. */
  spikes: PickerOption[];
}

/**
 * Loaded once when the admin "Add menu item" dialog opens. Returns the
 * content lists for every menu-item type the dialog supports. At
 * personal-scale this is fine to send all at once; if it ever needs
 * paging, switch to a typeahead like `searchContentForLink` in
 * `@core/links/picker-actions`.
 */
export async function loadMenuItemPickerOptions(): Promise<{
  pages: PickerOption[];
  posts: PickerOption[];
  topics: PickerOption[];
  pillars: PillarPickerOption[];
}> {
  const session = await auth();
  if (!session?.user?.id) {
    return { pages: [], posts: [], topics: [], pillars: [] };
  }

  const [pages, posts, topics] = await Promise.all([
    listPages(db(), { status: "published", view: "live" }),
    listPosts(db(), { status: "published", view: "live" }),
    listTopics(db()),
  ]);

  // Build the pillar list from the same `posts` query — published
  // pillars are the roots, published spikes are their children. We
  // group by parent_id so each pillar carries its spike list.
  const pillarRoots = posts.filter((p) => p.postKind === "pillar");
  const spikeByParent = new Map<number, PickerOption[]>();
  for (const p of posts) {
    if (p.postKind !== "spike" || p.parentId == null) continue;
    const url =
      p.parentSlug && p.parentSlug.length > 0
        ? `/${p.parentSlug}/${p.slug}`
        : `/${p.slug}`;
    const arr = spikeByParent.get(p.parentId) ?? [];
    arr.push({ id: p.id, label: p.title, url });
    spikeByParent.set(p.parentId, arr);
  }
  const pillars: PillarPickerOption[] = pillarRoots.map((p) => ({
    id: p.id,
    label: p.title,
    url: `/${p.slug}`,
    spikes: spikeByParent.get(p.id) ?? [],
  }));

  return {
    pages: pages.map((p) => ({ id: p.id, label: p.title, url: `/${p.slug}` })),
    posts: posts.map((p) => ({
      id: p.id,
      label: p.title,
      url:
        p.postKind === "spike" && p.parentSlug
          ? `/${p.parentSlug}/${p.slug}`
          : `/${p.slug}`,
    })),
    topics: topics.map((t) => ({ id: t.id, label: t.name, url: `/topics/${t.slug}` })),
    pillars,
  };
}
