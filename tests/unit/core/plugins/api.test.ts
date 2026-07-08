import { describe, it, expect, vi } from "vitest";
import { HookBus } from "@core/hooks/bus";
import { createPluginAPI } from "@core/plugins/api";

describe("createPluginAPI", () => {
  it("forwards api.hooks.action to the HookBus with the plugin slug attached", async () => {
    const bus = new HookBus();
    const handler = vi.fn().mockResolvedValue(undefined);

    const api = createPluginAPI({
      pluginSlug: "alpha",
      bus,
      reserveSlug: vi.fn(),
      releaseSlug: vi.fn()
    });
    api.hooks.action("user.login" as never, handler as never);

    await bus.doAction("user.login" as never, { user: { id: 7 } } as never);
    expect(handler).toHaveBeenCalledWith({ user: { id: 7 } });
  });

  it("forwards api.hooks.filter to the HookBus", async () => {
    const bus = new HookBus();
    const api = createPluginAPI({
      pluginSlug: "alpha",
      bus,
      reserveSlug: vi.fn(),
      releaseSlug: vi.fn()
    });
    api.hooks.filter(
      "post.content" as never,
      (async ({ value }: { value: string; ctx: unknown }) => `<i>${value}</i>`) as never
    );
    const out = await bus.applyFilters("post.content" as never, "x" as never, {} as never);
    expect(out).toBe("<i>x</i>");
  });

  it("api.routes.reserveSlug forwards to the registry callback with source = plugin:<slug>", () => {
    const reserve = vi.fn();
    const api = createPluginAPI({
      pluginSlug: "beta",
      bus: new HookBus(),
      reserveSlug: reserve,
      releaseSlug: vi.fn()
    });
    api.routes.reserveSlug({ slug: "guides", reason: "Topic landings" });
    expect(reserve).toHaveBeenCalledWith({
      slug: "guides",
      reason: "Topic landings",
      source: "plugin:beta"
    });
  });

  it("api.routes.releaseSlug forwards with the plugin source", () => {
    const release = vi.fn();
    const api = createPluginAPI({
      pluginSlug: "beta",
      bus: new HookBus(),
      reserveSlug: vi.fn(),
      releaseSlug: release
    });
    api.routes.releaseSlug("guides");
    expect(release).toHaveBeenCalledWith("guides", "plugin:beta");
  });

  it("provides phase-1 stubs that throw with a useful message for unimplemented surfaces", () => {
    const api = createPluginAPI({
      pluginSlug: "beta",
      bus: new HookBus(),
      reserveSlug: vi.fn(),
      releaseSlug: vi.fn()
    });
    expect(() => api.routes.register("/x", {} as never)).toThrow(/phase 1/i);
    expect(() => api.admin.menu({} as never)).toThrow(/phase 1/i);
    expect(() => api.permissions.define("x.y")).toThrow(/phase 1/i);
    expect(() =>
      api.postTypes.register({ slug: "x", labels: { singular: "X", plural: "Xs" } } as never)
    ).toThrow(/phase 1/i);
  });
});
