"use server";

import { db } from "@core/db/instance";
import { listPillars } from "./service";

export interface AvailablePillar {
  id: number;
  title: string;
  slug: string;
}

/**
 * Pillars for picking inside a Puck block field — mirrors the topic
 * picker contract. Returns only published pillars; drafts would
 * confuse the public-render expectation of the calling widget.
 */
export async function loadAvailablePillars(): Promise<AvailablePillar[]> {
  const all = await listPillars(db());
  return all
    .filter((p) => p.status === "published")
    .map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
}
