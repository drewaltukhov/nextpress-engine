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
  const all = await listTopics(db());
  return all
    .map((t) => ({ slug: t.slug, name: t.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
