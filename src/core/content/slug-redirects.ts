/**
 * Auto-redirects after a post's slug or parent changes — ONE implementation
 * for the admin editor (posts/actions.ts) and the posts API (PATCH
 * /api/v1/posts/:id), so the two can't drift (#4).
 *
 * Rules: only a post that was already published gets a redirect (renaming a
 * draft must not touch the site-wide redirect table — security audit
 * 2026-11-12); a pillar rename cascades to every `/pillar/spike` URL under it;
 * createAutoRedirect never deletes or overrides a manual redirect and honours
 * the per-source admin toggle. Failures never break the save.
 */
import type { DbClient } from "@core/db/client";
import { getPost, listPosts, type PostDetail, type PostKind } from "@core-plugins/posts";
import { createAutoRedirect, manualRedirectWarning } from "@core-plugins/redirects";

export interface SlugRedirectSnapshot {
  before: PostDetail | null;
  pillarSpikes: { id: number; slug: string }[];
}

/** Mirrors the public-route resolution in src/app/[slug] + [slug]/[childSlug]. */
export function postPublicUrl(post: { slug: string; postKind: PostKind; parentSlug: string | null }): string {
  if (post.postKind === "spike" && post.parentSlug) {
    return `/${post.parentSlug}/${post.slug}`;
  }
  return `/${post.slug}`;
}

/** Call BEFORE the update: the post as it is now, plus a pillar's spikes. */
export async function snapshotForSlugRedirects(db: DbClient, id: number): Promise<SlugRedirectSnapshot> {
  const before = await getPost(db, id);
  let pillarSpikes: { id: number; slug: string }[] = [];
  if (before && before.postKind === "pillar") {
    const spikes = await listPosts(db, { view: "live", kind: "spike", pillarId: id });
    pillarSpikes = spikes.map((s) => ({ id: s.id, slug: s.slug }));
  }
  return { before, pillarSpikes };
}

/**
 * Call AFTER the update succeeded. Never throws. Returns an editor-facing
 * warning when the post's new URL is hidden by a manual redirect (#5).
 */
export async function applySlugRedirects(
  db: DbClient,
  id: number,
  snapshot: SlugRedirectSnapshot,
  createdBy: string | null,
): Promise<string | null> {
  try {
    const { before, pillarSpikes } = snapshot;
    const after = await getPost(db, id);
    if (!before || !after) return null;
    const oldUrl = postPublicUrl(before);
    const newUrl = postPublicUrl(after);
    const warning = oldUrl !== newUrl ? await manualRedirectWarning(db, newUrl) : null;
    if (before.status !== "published") return warning;

    if (oldUrl !== newUrl) {
      await createAutoRedirect(db, {
        fromPath: oldUrl,
        toPath: newUrl,
        source: before.slug !== after.slug ? "slug_change" : "permalink_change",
        createdBy,
      });
    }
    // Pillar slug change cascades to every spike URL underneath.
    if (before.postKind === "pillar" && after.postKind === "pillar" && before.slug !== after.slug) {
      for (const spike of pillarSpikes) {
        await createAutoRedirect(db, {
          fromPath: `/${before.slug}/${spike.slug}`,
          toPath: `/${after.slug}/${spike.slug}`,
          source: "slug_change",
          createdBy,
        });
      }
    }
    return warning;
  } catch {
    // Redirect creation is non-fatal.
    return null;
  }
}
