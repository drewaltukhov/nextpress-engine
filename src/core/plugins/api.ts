import type { HookBus } from "@core/hooks/bus";
import type { ActionHandler, FilterHandler, ActionMap, FilterMap } from "@core/hooks/types";
import { registerDashboardWidget, type DashboardWidget } from "@core/dashboard/registry";
import { registerBlock, type RegisteredBlock } from "@core/blocks/registry";

export interface ReserveSlugInput {
  slug: string;
  reason: string;
}

export interface ReserveSlugFullInput extends ReserveSlugInput {
  source: string;
}

export interface PluginAPI {
  hooks: {
    action<K extends keyof ActionMap>(name: K, handler: ActionHandler<K>): void;
    filter<K extends keyof FilterMap>(name: K, handler: FilterHandler<K>): void;
  };
  routes: {
    reserveSlug(input: ReserveSlugInput): void;
    releaseSlug(slug: string): void;
    register(path: string, segment: unknown): void;
  };
  admin: {
    menu(input: unknown): void;
  };
  permissions: {
    define(name: string): void;
  };
  postTypes: {
    register(input: unknown): void;
  };
  dashboard: {
    /**
     * Register a widget on the user dashboard. The widget's `source` is
     * auto-stamped with the calling plugin's slug, so callers only need
     * to pass `Omit<DashboardWidget, 'source'>`.
     */
    registerWidget<T>(widget: Omit<DashboardWidget<T>, "source">): void;
  };
  blocks: {
    /**
     * Register a Puck block in the cross-surface block registry. Both
     * `source` and `name` are auto-prefixed by the engine —
     * `plugin:<slug>` for `type: "plugin"` manifests, `theme:<slug>`
     * for `type: "theme"`. The stored block name becomes
     * `<source>:<your-bare-name>` (e.g. `plugin:crypto-beat:Prices`).
     *
     * The bare `name` you pass MUST NOT contain a colon — the engine
     * throws if it does. See `docs/plugins/theme-widgets.mdx` for the
     * full namespacing rules.
     */
    register(block: Omit<RegisteredBlock, "source">): void;
  };
}

export interface CreatePluginAPIArgs {
  pluginSlug: string;
  /** `plugin` for normal plugins; `theme` for entries with type:"theme"
   *  in their manifest. Used to stamp blocks' `source` field. */
  manifestType?: "plugin" | "theme";
  bus: HookBus;
  reserveSlug: (input: ReserveSlugFullInput) => void | Promise<void>;
  releaseSlug: (slug: string, source: string) => void | Promise<void>;
}

const NOT_IN_PHASE_1 = (surface: string) =>
  new Error(
    `${surface} is not implemented in Phase 1 (kernel only). It will land in a later phase. ` +
      `If you're seeing this from a plugin, you're trying to use a surface that hasn't shipped yet.`
  );

function swallowAsync(p: void | Promise<void>, label: string): void {
  if (p && typeof (p as Promise<void>).then === "function") {
    (p as Promise<void>).catch((err) => console.error(`[${label}]`, err));
  }
}

export function createPluginAPI(args: CreatePluginAPIArgs): PluginAPI {
  const ctx = { pluginSlug: args.pluginSlug };
  return {
    hooks: {
      action: (name, handler) => args.bus.action(name, handler, ctx),
      filter: (name, handler) => args.bus.filter(name, handler, ctx)
    },
    routes: {
      reserveSlug: (input) => {
        swallowAsync(
          args.reserveSlug({
            slug: input.slug,
            reason: input.reason,
            source: `plugin:${args.pluginSlug}`
          }),
          `reserveSlug ${args.pluginSlug}/${input.slug}`
        );
      },
      releaseSlug: (slug) => {
        swallowAsync(
          args.releaseSlug(slug, `plugin:${args.pluginSlug}`),
          `releaseSlug ${args.pluginSlug}/${slug}`
        );
      },
      register: () => { throw NOT_IN_PHASE_1("api.routes.register"); }
    },
    admin: { menu: () => { throw NOT_IN_PHASE_1("api.admin.menu"); } },
    permissions: { define: () => { throw NOT_IN_PHASE_1("api.permissions.define"); } },
    postTypes: { register: () => { throw NOT_IN_PHASE_1("api.postTypes.register"); } },
    dashboard: {
      registerWidget: (widget) => {
        registerDashboardWidget({ ...widget, source: args.pluginSlug } as DashboardWidget<unknown>);
      }
    },
    blocks: {
      register: (block) => {
        if (block.name.includes(":")) {
          throw new Error(
            `[plugin:${args.pluginSlug}] block name "${block.name}" must not contain a colon (":"). ` +
              `Plugin block names are auto-prefixed by the engine. ` +
              `See docs/plugins/theme-widgets.mdx for the namespacing rules.`,
          );
        }
        const sourceLabel = `${args.manifestType ?? "plugin"}:${args.pluginSlug}`;
        const prefixedName = `${sourceLabel}:${block.name}`;
        registerBlock({ ...block, name: prefixedName, source: sourceLabel });
      }
    }
  };
}
