/**
 * Filter declarations for plugin-contributed JSON-LD nodes on a
 * published Post.
 *
 * Plugins push additional JSON-LD nodes (Review, Recipe, FAQPage, etc.)
 * into the emitted graph by registering a handler against
 * `seo.jsonld.post`. The handler receives the post being rendered
 * plus the URLs the engine has already resolved, and returns the
 * complete node list — typically by appending to `value`:
 *
 *   api.hooks.filter("seo.jsonld.post", ({ value, ctx }) => {
 *     const review = buildReviewNode(ctx.post, ctx.siteUrl);
 *     return review ? [...value, review] : value;
 *   });
 *
 * The engine takes care of de-duping the wrapper graph and emitting
 * a single `<script type="application/ld+json">` per page; plugins
 * just contribute their nodes and don't worry about the surrounding
 * `@graph` shape.
 *
 * Mounted in `posts/published-view.tsx:PostJsonLd` immediately after
 * `buildPostJsonLdNodes` runs, before the JSON.stringify pass.
 */
import type { PostDetail } from "./service";

/** A single JSON-LD node, shaped as the schema.org JSON literals expect.
 *  Widened to `object` so callers that emit anonymous-object literals
 *  (no explicit index signature) satisfy the type without a cast. */
export type JsonLdNode = object;

export interface JsonLdPostContext {
  /** The post being rendered. */
  post: PostDetail;
  /** Resolved absolute URL for this post's public page. */
  pageUrl: string;
  /** Resolved absolute site origin (no trailing slash). */
  siteUrl: string;
}

declare module "@core/hooks/types" {
  interface FilterMap {
    "seo.jsonld.post": {
      value: JsonLdNode[];
      ctx: JsonLdPostContext;
    };
  }
}

// `export {}` keeps this file a module so the `declare module` is
// a module augmentation and not an ambient declaration.
export {};
