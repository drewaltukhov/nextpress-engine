import type {
  ActionMap,
  FilterMap,
  HookContext,
  ActionHandler,
  FilterHandler,
  HookFailure
} from "./types";

interface RegisteredAction<K extends keyof ActionMap> {
  pluginSlug: string;
  handler: ActionHandler<K>;
}

interface RegisteredFilter<K extends keyof FilterMap> {
  pluginSlug: string;
  handler: FilterHandler<K>;
}

type FailureListener = (failure: HookFailure) => void;

export class HookBus {
  private actions = new Map<string, RegisteredAction<keyof ActionMap>[]>();
  private filters = new Map<string, RegisteredFilter<keyof FilterMap>[]>();
  private failureListeners: FailureListener[] = [];

  action<K extends keyof ActionMap>(name: K, handler: ActionHandler<K>, ctx: HookContext): void {
    const list = this.actions.get(name as string) ?? [];
    list.push({ pluginSlug: ctx.pluginSlug, handler: handler as ActionHandler<keyof ActionMap> });
    this.actions.set(name as string, list);
  }

  filter<K extends keyof FilterMap>(name: K, handler: FilterHandler<K>, ctx: HookContext): void {
    const list = this.filters.get(name as string) ?? [];
    list.push({ pluginSlug: ctx.pluginSlug, handler: handler as FilterHandler<keyof FilterMap> });
    this.filters.set(name as string, list);
  }

  async doAction<K extends keyof ActionMap>(name: K, payload: ActionMap[K]): Promise<void> {
    const list = this.actions.get(name as string) ?? [];
    for (const entry of list) {
      try {
        await (entry.handler as ActionHandler<K>)(payload);
      } catch (err) {
        this.emitFailure({
          pluginSlug: entry.pluginSlug,
          hookName: name as string,
          kind: "action",
          error: err instanceof Error ? err : new Error(String(err))
        });
      }
    }
  }

  async applyFilters<K extends keyof FilterMap>(
    name: K,
    initial: FilterMap[K] extends { value: infer V } ? V : never,
    ctx: FilterMap[K] extends { ctx: infer C } ? C : never
  ): Promise<FilterMap[K] extends { value: infer V } ? V : never> {
    const list = this.filters.get(name as string) ?? [];
    let value = initial;
    for (const entry of list) {
      try {
        value = await (entry.handler as unknown as (args: { value: typeof value; ctx: typeof ctx }) => Promise<typeof value> | typeof value)({
          value,
          ctx
        });
      } catch (err) {
        this.emitFailure({
          pluginSlug: entry.pluginSlug,
          hookName: name as string,
          kind: "filter",
          error: err instanceof Error ? err : new Error(String(err))
        });
      }
    }
    return value;
  }

  clearPlugin(pluginSlug: string): void {
    for (const [name, list] of this.actions) {
      this.actions.set(name, list.filter((e) => e.pluginSlug !== pluginSlug));
    }
    for (const [name, list] of this.filters) {
      this.filters.set(name, list.filter((e) => e.pluginSlug !== pluginSlug));
    }
  }

  reset(): void {
    this.actions.clear();
    this.filters.clear();
  }

  onFailure(listener: FailureListener): void {
    this.failureListeners.push(listener);
  }

  private emitFailure(failure: HookFailure): void {
    for (const l of this.failureListeners) {
      try { l(failure); } catch { /* listener errors are swallowed; listeners must be safe */ }
    }
  }
}
