"use server";

import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { resolveUserId } from "@core/auth/resolve-user";
import { saveDashboardLayout, type DashboardLayout } from "@core/dashboard/layout";

export interface SaveLayoutResult {
  ok: boolean;
  error?: string;
}

/** Persist the current user's dashboard layout. Called by DashboardGrid on every drag/resize. */
export async function saveDashboardLayoutAction(
  layout: DashboardLayout
): Promise<SaveLayoutResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated" };
  try {
    const userId = await resolveUserId(db(), session.user);
    await saveDashboardLayout(db(), userId, layout);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Save failed" };
  }
}
