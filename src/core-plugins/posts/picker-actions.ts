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
  // Editor pickers ship in public page bundles (block configs are shared with
  // the public renderer), so the action must refuse anonymous callers itself
  // (security audit 2026-11-12). Imported lazily: plugin entry modules import
  // this file, and a top-level @core/auth import would pull next-auth into
  // every non-request context that loads the plugin.
  const { auth } = await import("@core/auth");
  if (!(await auth())?.user?.id) return [];
  const all = await listPillars(db());
  return all
    .filter((p) => p.status === "published")
    .map((p) => ({ id: p.id, title: p.title, slug: p.slug }));
}
