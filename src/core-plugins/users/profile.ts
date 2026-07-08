import { db } from "@core/db/instance";
import { normalizeSlug } from "@core/slugs/normalize";

export interface AuthorProfile {
  id: string;
  /** displayName slugified — the value used in `/author/<username>`. */
  username: string;
  displayName: string;
  fullName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  /** `meta.socials` flattened to a `{ platform: url }` map. Empty when
   *  the user hasn't filled any social fields. */
  socials: Record<string, string>;
}

interface UserMetaShape {
  socials?: unknown;
}

function rowToProfile(row: Record<string, unknown>): AuthorProfile {
  const meta = parseMeta(row.meta);
  return {
    id: String(row.id),
    username: normalizeSlug(String(row.display_name ?? "")),
    displayName: String(row.display_name ?? ""),
    fullName: row.full_name != null ? String(row.full_name) : null,
    avatarUrl: row.avatar_url != null ? String(row.avatar_url) : null,
    bio: row.bio != null ? String(row.bio) : null,
    socials: socialsFromMeta(meta.socials),
  };
}

function parseMeta(raw: unknown): UserMetaShape {
  if (raw == null) return {};
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as UserMetaShape) : {};
    } catch {
      return {};
    }
  }
  if (typeof raw === "object") return raw as UserMetaShape;
  return {};
}

function socialsFromMeta(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof v !== "string") continue;
    const trimmed = v.trim();
    if (trimmed.length === 0) continue;
    out[k] = trimmed;
  }
  return out;
}

/**
 * Look up an author by the slugified form of their `displayName`. Used by
 * the public `/author/<username>` route. Compares slugs in-memory because
 * the users table doesn't carry a slug column — fine at personal scale,
 * room to add a real `slug` column later if multi-tenant collisions
 * become a concern.
 *
 * Returns the first non-deleted, active match. `null` when no user has
 * a display name slugifying to this value.
 */
export async function getAuthorByUsername(
  username: string,
): Promise<AuthorProfile | null> {
  const target = normalizeSlug(username);
  if (target.length === 0) return null;
  const r = await db().execute({
    sql: `SELECT id, display_name, full_name, avatar_url, bio, meta
          FROM users
          WHERE tenant_id = 1 AND deleted_at IS NULL AND status = 'active'`,
    args: [],
  });
  for (const row of r.rows) {
    const profile = rowToProfile(row);
    if (profile.username === target) return profile;
  }
  return null;
}

/**
 * Look up an author by their UUID. Used by the post renderer to build
 * the byline (full name + link to `/author/<username>`) for the post's
 * creator. Returns `null` when the user was deleted or the id doesn't
 * resolve.
 */
export async function getAuthorById(id: string): Promise<AuthorProfile | null> {
  if (!id) return null;
  const r = await db().execute({
    sql: `SELECT id, display_name, full_name, avatar_url, bio, meta
          FROM users
          WHERE tenant_id = 1 AND deleted_at IS NULL AND id = ?
          LIMIT 1`,
    args: [id],
  });
  if (r.rows.length === 0) return null;
  return rowToProfile(r.rows[0]);
}

/**
 * Convert a profile's stored social values into fully-qualified URLs,
 * suitable for `sameAs` in a `Person` JSON-LD node and for the
 * AuthorLinks block's `<a href>`. WhatsApp numbers become `wa.me/<digits>`,
 * bare Telegram handles become `t.me/<handle>`, anything already pointing
 * at `https://` (or `mailto:`) is passed through. Empty / unparseable
 * values are dropped.
 */
export function authorProfileSameAs(profile: AuthorProfile): string[] {
  const out: string[] = [];
  for (const [platform, raw] of Object.entries(profile.socials)) {
    const url = normalizeSocialValue(platform, raw);
    if (url) out.push(url);
  }
  return out;
}

function normalizeSocialValue(platform: string, value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed) || trimmed.startsWith("mailto:")) return trimmed;
  if (platform === "whatsapp") {
    const digits = trimmed.replace(/\D/g, "");
    return digits ? `https://wa.me/${digits}` : "";
  }
  if (platform === "telegram") {
    const handle = trimmed.replace(/^@/, "").replace(/^t\.me\//, "");
    return handle ? `https://t.me/${handle}` : "";
  }
  return "";
}
