import { describe, it, expect, vi } from "vitest";

vi.mock("@core-plugins/settings/registry", () => {
  const captured: Array<{ key: string; defaultValue: unknown; scope: string }> = [];
  return {
    defineSettings: (defs: Array<{ key: string; defaultValue: unknown; scope: string }>) => {
      captured.push(...defs);
    },
    getSetting: vi.fn(),
    __captured: captured,
  };
});

import register from "@plugins/hide-admin";
import * as registry from "@core-plugins/settings/registry";

describe("hide-admin — settings registration", () => {
  it("defines exactly one setting: hide-admin.path", () => {
    // Minimal PluginAPI stub — the plugin only uses defineSettings
    // synchronously, no hooks or dashboard widgets in v1.
    const api = {
      hooks: { filter: vi.fn(), action: vi.fn() },
      dashboard: { registerWidget: vi.fn() },
    } as unknown as Parameters<typeof register>[0];

    register(api);

    const captured = (registry as unknown as { __captured: Array<{ key: string; defaultValue: unknown; scope: string }> }).__captured;
    const ours = captured.filter((s) => s.key.startsWith("hide-admin."));
    expect(ours).toHaveLength(1);
    expect(ours[0].key).toBe("hide-admin.path");
    expect(ours[0].defaultValue).toBe("");
    expect(ours[0].scope).toBe("private");
  });
});
