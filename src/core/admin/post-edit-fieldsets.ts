"use client";

/**
 * Plugin extension surface for the admin Post edit form.
 *
 * Plugins ship an `admin-contributions.tsx` file in their plugin root
 * (mirroring the `theme-blocks.tsx` convention) that calls
 * `registerPostEditFieldset(...)` at module load. The discovery script
 * generates `src/generated/plugin-admin-contributions.ts` which the
 * client-side PostEditForm side-effect-imports — so on load, the
 * registry is populated and the form can render each contributed
 * fieldset alongside the engine's built-in fields.
 *
 * Each contribution owns its own slice of state and supplies a save
 * callback (typically a `"use server"` action) that runs after the
 * engine's post update succeeds. The form does not look at the
 * contribution's data shape — it just hands the contribution's
 * Component a (value, onChange) pair.
 *
 * The third NextPress plugin extension hook (after `seo.jsonld.post`
 * and `theme.metadata`).
 */
import type { ComponentType } from "react";
import type { PostDetail } from "@core-plugins/posts";

export interface PostEditFieldsetContributionProps<T> {
  value: T;
  onChange: (next: T) => void;
  /** The post being edited. `null` on the "new post" creation flow. */
  post: PostDetail | null;
}

export interface PostEditFieldsetContribution<T = unknown> {
  /** Stable, fully-qualified id (e.g. `"plugin:envisia-reviews:review"`).
   *  Must contain a colon — same namespacing rule as `api.blocks.register`. */
  id: string;
  /** Section heading shown in the admin form. */
  label: string;
  /** Initial state when the post has no data for this contribution. */
  defaultState: T;
  /** Pluck this contribution's state out of an existing post. Called
   *  once on mount; returns `defaultState` if `post` is `null`.
   *
   *  Returns `T` or `Promise<T>` — async lets the plugin call a server
   *  action (`"use server"`) to fetch from its own table without the
   *  engine knowing about it. PostEditForm awaits the promise during
   *  initialization; the UI shows `defaultState` until it resolves. */
  read: (post: PostDetail | null) => T | Promise<T>;
  /** Persist this contribution's state. Called by the form AFTER the
   *  engine's post update succeeds, with the new (or existing) post id.
   *  Typically a `"use server"` action exported from the plugin. */
  save: (postId: number, state: T) => Promise<void>;
  /** The fieldset UI. Receives (value, onChange, post). */
  Component: ComponentType<PostEditFieldsetContributionProps<T>>;
}

// The registry lives on globalThis to survive Turbopack HMR reloads —
// otherwise edits to the registry module would clear it and any
// already-imported plugin module wouldn't re-register.
const REGISTRY_KEY = "__nextpress_post_edit_fieldsets__" as const;

function getRegistry(): Map<string, PostEditFieldsetContribution<unknown>> {
  const w = globalThis as unknown as Record<string, Map<string, PostEditFieldsetContribution<unknown>> | undefined>;
  let r = w[REGISTRY_KEY];
  if (!r) {
    r = new Map();
    w[REGISTRY_KEY] = r;
  }
  return r;
}

/**
 * Register a Post edit fieldset contribution. Called from a plugin's
 * `admin-contributions.tsx` file at module load. Last-call-wins per
 * `id` so dev-server hot reloads stay coherent (the plugin's module
 * re-evaluates and re-registers without piling up stale duplicates).
 */
export function registerPostEditFieldset<T>(c: PostEditFieldsetContribution<T>): void {
  if (!c.id.includes(":")) {
    throw new Error(
      `[PostEditFieldset] contribution id "${c.id}" must be namespaced (e.g. "plugin:<slug>:<fieldset-id>").`,
    );
  }
  getRegistry().set(c.id, c as PostEditFieldsetContribution<unknown>);
}

export function getPostEditFieldsets(): PostEditFieldsetContribution<unknown>[] {
  return Array.from(getRegistry().values());
}
