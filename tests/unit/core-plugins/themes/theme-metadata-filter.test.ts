// tests/unit/core-plugins/themes/theme-metadata-filter.test.ts
import { describe, it, expect } from "vitest";
import { HookBus } from "@core/hooks/bus";
import "@core-plugins/themes/render-types"; // declaration merging side-effect

describe("theme.metadata filter wiring", () => {
  it("passes initial value and ctx through to handlers and merges results", async () => {
    const bus = new HookBus();
    bus.filter(
      "theme.metadata",
      async ({ value, ctx }) => {
        // ctx is the ActiveThemeContext shape; we just confirm it exists
        expect(ctx).toBeDefined();
        return { ...value, "plugin-a": { hello: "world" } };
      },
      { pluginSlug: "plugin-a" },
    );
    bus.filter(
      "theme.metadata",
      ({ value }) => ({ ...value, "plugin-b": { count: 42 } }),
      { pluginSlug: "plugin-b" },
    );

    const result = await bus.applyFilters(
      "theme.metadata",
      {} as Record<string, unknown>,
      { templateId: "homepage" } as never, // partial ctx ok for the test
    );

    expect(result["plugin-a"]).toEqual({ hello: "world" });
    expect(result["plugin-b"]).toEqual({ count: 42 });
  });
});
