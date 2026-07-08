/**
 * Helper for plugin / theme `theme-blocks` files.
 *
 * Plugins that ship theme widgets place their block configs in a
 * client-safe `theme-blocks.tsx` file inside the plugin folder. That
 * file calls `registerPluginThemeBlocks(...)` as a side-effect; both
 * the server-side render path and the client-side editors evaluate
 * the file (the discovery script generates `src/generated/plugin-blocks.ts`
 * with side-effect imports), so the cross-surface registry is populated
 * identically on both sides.
 *
 * The helper applies the same strict-namespacing rule as
 * `api.blocks.register`: bare `name` must not contain a colon, and
 * the engine prefixes it with `<type>:<slug>:`.
 *
 * See `docs/plugins/theme-widgets.mdx` for the full plugin-author
 * contract.
 */
import { registerBlock, type RegisteredBlock } from "./registry";

export interface PluginThemeBlocksInput {
  /** Plugin or theme slug — must match `slug` in `plugin.json`. */
  slug: string;
  /** `"plugin"` (default) or `"theme"` — matches the manifest `type`. */
  type?: "plugin" | "theme";
  /** Each block: bare `name` (no colon), `config`, `surfaces`, `category`,
   *  optional `essential`/`singleton`. The engine stamps `source` and
   *  prefixes `name`. */
  blocks: ReadonlyArray<Omit<RegisteredBlock, "source">>;
}

export function registerPluginThemeBlocks(input: PluginThemeBlocksInput): void {
  const sourceLabel = `${input.type ?? "plugin"}:${input.slug}`;
  for (const block of input.blocks) {
    if (block.name.includes(":")) {
      throw new Error(
        `[${sourceLabel}] block name "${block.name}" must not contain a colon (":"). ` +
          `Plugin block names are auto-prefixed by the engine. ` +
          `See docs/plugins/theme-widgets.mdx for the namespacing rules.`,
      );
    }
    const prefixedName = `${sourceLabel}:${block.name}`;
    registerBlock({ ...block, name: prefixedName, source: sourceLabel });
  }
}
