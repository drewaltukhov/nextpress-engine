import { describe, it, expect, vi } from "vitest";
import { HookBus } from "@core/hooks/bus";

describe("HookBus — actions", () => {
  it("runs all registered handlers", async () => {
    const bus = new HookBus();
    const a = vi.fn().mockResolvedValue(undefined);
    const b = vi.fn().mockResolvedValue(undefined);
    bus.action("user.login" as never, a as never, { pluginSlug: "p1" });
    bus.action("user.login" as never, b as never, { pluginSlug: "p2" });

    await bus.doAction("user.login" as never, { user: { id: 1 } } as never);

    expect(a).toHaveBeenCalledWith({ user: { id: 1 } });
    expect(b).toHaveBeenCalledWith({ user: { id: 1 } });
  });

  it("isolates a throwing handler — others still run", async () => {
    const bus = new HookBus();
    const onError = vi.fn();
    bus.onFailure(onError);
    bus.action(
      "user.login" as never,
      (async () => { throw new Error("boom"); }) as never,
      { pluginSlug: "bad" }
    );
    const ok = vi.fn().mockResolvedValue(undefined);
    bus.action("user.login" as never, ok as never, { pluginSlug: "good" });

    await bus.doAction("user.login" as never, { user: { id: 1 } } as never);

    expect(ok).toHaveBeenCalled();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({
      pluginSlug: "bad",
      hookName: "user.login",
      kind: "action"
    });
  });
});

describe("HookBus — filters", () => {
  it("chains handlers in registration order", async () => {
    const bus = new HookBus();
    bus.filter(
      "post.content" as never,
      (async ({ value }: { value: string; ctx: unknown }) => `<p>${value}</p>`) as never,
      { pluginSlug: "p1" }
    );
    bus.filter(
      "post.content" as never,
      (async ({ value }: { value: string; ctx: unknown }) => `<div>${value}</div>`) as never,
      { pluginSlug: "p2" }
    );

    const out = await bus.applyFilters("post.content" as never, "hello" as never, {} as never);
    expect(out).toBe("<div><p>hello</p></div>");
  });

  it("skips a throwing handler — passes prior value to the next", async () => {
    const bus = new HookBus();
    const onError = vi.fn();
    bus.onFailure(onError);
    bus.filter(
      "post.content" as never,
      (async ({ value }: { value: string; ctx: unknown }) => `<p>${value}</p>`) as never,
      { pluginSlug: "p1" }
    );
    bus.filter(
      "post.content" as never,
      (async () => { throw new Error("nope"); }) as never,
      { pluginSlug: "bad" }
    );
    bus.filter(
      "post.content" as never,
      (async ({ value }: { value: string; ctx: unknown }) => `<div>${value}</div>`) as never,
      { pluginSlug: "p3" }
    );

    const out = await bus.applyFilters("post.content" as never, "hello" as never, {} as never);
    expect(out).toBe("<div><p>hello</p></div>");
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0]).toMatchObject({ pluginSlug: "bad", kind: "filter" });
  });
});

describe("HookBus — isolation utilities", () => {
  it("clearPlugin removes handlers from a single plugin", async () => {
    const bus = new HookBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.action("user.login" as never, a as never, { pluginSlug: "p1" });
    bus.action("user.login" as never, b as never, { pluginSlug: "p2" });
    bus.clearPlugin("p1");
    await bus.doAction("user.login" as never, {} as never);
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalled();
  });
});
