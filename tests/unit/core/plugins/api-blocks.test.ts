// tests/unit/core/plugins/api-blocks.test.ts
import { createElement } from "react";
import { describe, it, expect, beforeEach } from "vitest";
import { createPluginAPI } from "@core/plugins/api";
import { HookBus } from "@core/hooks/bus";
import { listAllBlocks } from "@core/blocks/registry";
import type { ComponentConfig } from "@measured/puck";

function noop() { /* noop */ }

const fakeConfig: ComponentConfig<{ x: string }> = {
  fields: { x: { type: "text" } },
  defaultProps: { x: "" },
  render: () => createElement("div"),
};

describe("api.blocks.register — strict namespacing", () => {
  beforeEach(() => {
    // The block registry is global; isolate per test by removing
    // any blocks that could collide with names this test uses.
    // listAllBlocks returns a snapshot we can introspect, but we
    // don't expose a public unregister — tests use distinct names.
  });

  it("auto-prefixes plugin block name with plugin:<slug>:", () => {
    const bus = new HookBus();
    const api = createPluginAPI({
      pluginSlug: "test-plugin-1",
      bus,
      reserveSlug: noop,
      releaseSlug: noop,
    });
    api.blocks.register({
      name: "Foo",
      config: fakeConfig,
      surfaces: ["sidebar"],
      category: "Test",
    });
    const stored = listAllBlocks().find(
      (b) => b.name === "plugin:test-plugin-1:Foo",
    );
    expect(stored).toBeDefined();
    expect(stored?.source).toBe("plugin:test-plugin-1");
  });

  it("auto-prefixes theme block name with theme:<slug>: when manifestType is theme", () => {
    const bus = new HookBus();
    const api = createPluginAPI({
      pluginSlug: "test-theme-1",
      manifestType: "theme",
      bus,
      reserveSlug: noop,
      releaseSlug: noop,
    });
    api.blocks.register({
      name: "Bar",
      config: fakeConfig,
      surfaces: ["header"],
      category: "Test",
    });
    const stored = listAllBlocks().find(
      (b) => b.name === "theme:test-theme-1:Bar",
    );
    expect(stored).toBeDefined();
    expect(stored?.source).toBe("theme:test-theme-1");
  });

  it("throws if name contains a colon", () => {
    const bus = new HookBus();
    const api = createPluginAPI({
      pluginSlug: "test-plugin-2",
      bus,
      reserveSlug: noop,
      releaseSlug: noop,
    });
    expect(() =>
      api.blocks.register({
        name: "foo:Bar",
        config: fakeConfig,
        surfaces: ["sidebar"],
        category: "Test",
      }),
    ).toThrow(/colon/);
  });
});
