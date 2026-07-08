"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@core/auth";
import { invalidateUpdateCheck } from "@core/updates/check";

/**
 * Force a fresh GitHub version check on the next page render. The
 * cache is in-memory + globalThis-pinned, so dropping the entry makes
 * `getUpdateStatus()` re-fetch synchronously on the next read.
 */
export async function refreshUpdateCheck(): Promise<{ ok: boolean }> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false };
  invalidateUpdateCheck();
  revalidatePath("/admin/updates");
  return { ok: true };
}
