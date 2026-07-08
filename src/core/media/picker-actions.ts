"use server";

import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listMedia, type ListMediaResult } from "@core-plugins/media/service";

/**
 * Read-only paginated list for the in-app media picker dialog. Auth-gated to
 * any signed-in user; unlike `getLibrary` in the media admin page, this lives
 * outside that route group so any client component anywhere in the admin can
 * import it.
 */
export async function listMediaForPicker(
  page: number = 1,
  search: string = "",
): Promise<ListMediaResult> {
  const session = await auth();
  if (!session?.user?.id) {
    return { rows: [], page: 1, pageSize: 24, total: 0 };
  }
  return listMedia(db(), { page, search });
}
