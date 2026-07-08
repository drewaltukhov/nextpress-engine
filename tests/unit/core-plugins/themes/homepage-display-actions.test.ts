import { describe, it, expect, vi } from "vitest";

vi.mock("@core/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 1, roles: ["admin"] } }),
}));

vi.mock("@core-plugins/users/permissions", () => ({
  getEffectivePermissions: vi.fn().mockResolvedValue(new Set(["settings.manage", "themes.manage"])),
  hasPermission: (perms: Set<string>, perm: string) => perms.has(perm),
}));

const store = new Map<string, unknown>();
vi.mock("@core-plugins/settings/registry", () => ({
  getSetting: vi.fn(async <T>(_db: unknown, key: string, fallback?: T) => {
    return (store.has(key) ? (store.get(key) as T) : fallback);
  }),
  setSetting: vi.fn(async (_db: unknown, key: string, value: unknown) => {
    store.set(key, value);
  }),
}));

vi.mock("@core/db/instance", () => ({
  db: () => ({}),
}));

import {
  getHomepageDisplayOptions,
  setHomepageDisplayOption,
} from "@core-plugins/themes/homepage-display-actions";

describe("homepage-display-actions", () => {
  it("returns defaults when no rows are stored", async () => {
    store.clear();
    const opts = await getHomepageDisplayOptions();
    expect(opts.layout).toBe("grid");
    expect(opts.limit).toBe(12);
    expect(opts.showThumbnail).toBe(true);
    expect(opts.showTopic).toBe(false);
    expect(opts.gridColumns).toBe(2);
    expect(opts.gridAspect).toBe("rectangle");
    expect(opts.paginationEnabled).toBe(false);
    expect(opts.paginationStyle).toBe("numbered");
    expect(opts.paginationType).toBe("buttons");
    expect(opts.paginationAlign).toBe("center");
  });

  it("round-trips a value via setHomepageDisplayOption", async () => {
    store.clear();
    const result = await setHomepageDisplayOption("layout", "list");
    expect(result.ok).toBe(true);
    const opts = await getHomepageDisplayOptions();
    expect(opts.layout).toBe("list");
  });

  it("rejects an invalid layout value", async () => {
    store.clear();
    const result = await setHomepageDisplayOption("layout", "magazine" as never);
    expect(result.ok).toBe(false);
  });

  it("rejects limit outside 1..50", async () => {
    store.clear();
    const tooLow = await setHomepageDisplayOption("limit", 0);
    expect(tooLow.ok).toBe(false);
    const tooHigh = await setHomepageDisplayOption("limit", 999);
    expect(tooHigh.ok).toBe(false);
  });
});
