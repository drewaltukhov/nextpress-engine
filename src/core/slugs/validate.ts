import type { DbClient } from "@core/db/client";
import { isSlugReserved } from "./registry";
import { normalizeSlug, stripTrailingSlash } from "./normalize";

export interface ValidateInput {
  slug: string;
  effectivePath: string;
  tenantId?: number;
}

export type ValidateResult =
  | { ok: true }
  | { ok: false; code: "empty" | "reserved"; message: string };

export async function validateSlug(db: DbClient, input: ValidateInput): Promise<ValidateResult> {
  const norm = normalizeSlug(input.slug);
  if (norm.length === 0) {
    return { ok: false, code: "empty", message: "Slug is empty after normalization." };
  }

  const path = stripTrailingSlash(input.effectivePath);
  const isTopLevel = path === `/${norm}`;
  if (!isTopLevel) {
    return { ok: true };
  }

  const reserved = await isSlugReserved(db, norm, input.tenantId ?? 1);
  if (!reserved) return { ok: true };

  return {
    ok: false,
    code: "reserved",
    message:
      `"${norm}" is reserved. It conflicts with a system route. ` +
      `Choose another slug, or change this content's URL pattern to a non-root prefix (e.g. /posts/${norm}).`
  };
}
