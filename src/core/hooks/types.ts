/**
 * ActionMap and FilterMap are extended via TS declaration merging.
 * Plugins augment these to register their own hook payloads.
 *
 * Example (in a plugin):
 *   declare module "@core/hooks/types" {
 *     interface ActionMap {
 *       "user.login": { user: { id: string } };
 *     }
 *   }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ActionMap {
  // intentionally empty — extended by plugins
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface FilterMap {
  // each entry: { value: V; ctx: C } — both required
}

export interface HookContext {
  pluginSlug: string;
}

export type ActionHandler<K extends keyof ActionMap> = (payload: ActionMap[K]) => Promise<void> | void;

export type FilterHandler<K extends keyof FilterMap> =
  FilterMap[K] extends { value: infer V; ctx: infer C }
    ? (args: { value: V; ctx: C }) => Promise<V> | V
    : never;

export interface HookFailure {
  pluginSlug: string;
  hookName: string;
  kind: "action" | "filter";
  error: Error;
}
