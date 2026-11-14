"use server";

import { db } from "@core/db/instance";
import { listTopics } from "./service";

export interface AvailableTopic {
  slug: string;
  name: string;
}

/**
 * Return all topics, suitable for picking in a Puck block field.
 * Used by PostsGrid (and future blocks that filter by topic) so the
 * picker UX stays consistent and authors don't have to remember slugs.
 */
export async function loadAvailableTopics(): Promise<AvailableTopic[]> {
  // Editor pickers ship in public page bundles (block configs are shared with
  // the public renderer), so the action must refuse anonymous callers itself
  // (security audit 2026-11-12). Imported lazily: plugin entry modules import
  // this file, and a top-level @core/auth import would pull next-auth into
  // every non-request context that loads the plugin.
  const { auth } = await import("@core/auth");
  if (!(await auth())?.user?.id) return [];
  const all = await listTopics(db());
  return all
    .map((t) => ({ slug: t.slug, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
