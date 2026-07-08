import { describe, it, expect, vi } from "vitest";
import { PluginFailureRing, type PluginFailureRecord } from "@core/plugins/failures";

describe("PluginFailureRing — persist callback", () => {
  it("calls persist for each recorded boot failure", () => {
    const persist = vi.fn();
    const ring = new PluginFailureRing({ persist });
    ring.recordBoot("alpha", new Error("boom"));

    expect(persist).toHaveBeenCalledTimes(1);
    const rec = persist.mock.calls[0][0] as PluginFailureRecord;
    expect(rec.pluginSlug).toBe("alpha");
    expect(rec.source).toBe("boot");
    expect(rec.message).toBe("boom");
  });

  it("calls persist for each recorded hook failure with hookName populated", () => {
    const persist = vi.fn();
    const ring = new PluginFailureRing({ persist });
    ring.recordHook({
      pluginSlug: "beta",
      hookName: "user.login",
      kind: "action",
      error: new Error("nope")
    });

    expect(persist).toHaveBeenCalledTimes(1);
    const rec = persist.mock.calls[0][0] as PluginFailureRecord;
    expect(rec.source).toBe("hook");
    expect(rec.hookName).toBe("user.login");
    expect(rec.message).toBe("nope");
  });

  it("swallows async persist errors so the kernel never breaks", async () => {
    // Suppress the expected console.error noise for this case.
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const persist = vi.fn(() => Promise.reject(new Error("db down")));
    const ring = new PluginFailureRing({ persist });

    expect(() => ring.recordBoot("p", new Error("x"))).not.toThrow();
    // Wait one microtask cycle for the rejection to settle.
    await Promise.resolve();
    await Promise.resolve();

    errSpy.mockRestore();
    expect(persist).toHaveBeenCalled();
  });

  it("works without a persist callback (default options)", () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ring = new PluginFailureRing();
    ring.recordBoot("p", new Error("x"));
    expect(ring.list()).toHaveLength(1);
    errSpy.mockRestore();
  });
});
