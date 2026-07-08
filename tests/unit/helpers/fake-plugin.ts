import type { PluginManifest } from "@core/plugins/manifest";
import type { PluginAPI } from "@core/plugins/api";

export interface FakePluginEntry {
  manifest: PluginManifest;
  module: { default?: (api: PluginAPI) => void | Promise<void> };
  migrationsDir: string | null;
}

export function fakePlugin(opts: {
  slug: string;
  tier?: "essential" | "standard";
  dependencies?: string[];
  register?: (api: PluginAPI) => void | Promise<void>;
  migrationsDir?: string | null;
}): FakePluginEntry {
  return {
    manifest: {
      slug: opts.slug,
      name: opts.slug,
      version: "1.0.0",
      engine: "^1.0.0",
      type: "plugin",
      tier: opts.tier ?? "standard",
      dependencies: opts.dependencies ?? [],
      capabilities: {}
    },
    module: { default: opts.register ?? (() => {}) },
    migrationsDir: opts.migrationsDir ?? null
  };
}
