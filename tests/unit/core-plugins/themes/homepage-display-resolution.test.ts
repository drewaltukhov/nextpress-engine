import { describe, it, expect, vi } from "vitest";

vi.mock("@core/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: 1, roles: ["admin"] } }),
}));

vi.mock("@core-plugins/users/permissions", () => ({
  getEffectivePermissions: vi.fn().mockResolvedValue(new Set(["settings.manage"])),
  hasPermission: (perms: Set<string>, perm: string) => perms.has(perm),
}));

const settings = new Map<string, unknown>();
vi.mock("@core-plugins/settings/registry", () => ({
  getSetting: vi.fn(async (_db: unknown, key: string, fallback?: unknown) =>
    settings.has(key) ? settings.get(key) : fallback,
  ),
  setSetting: vi.fn(async (_db: unknown, key: string, value: unknown) => {
    settings.set(key, value);
  }),
}));

vi.mock("@core/db/instance", () => ({ db: () => ({}) }));

import { resolveHomepageDisplay } from "@core-plugins/themes/render";

describe("resolveHomepageDisplay", () => {
  it("returns options with defaults and pagination null when disabled", async () => {
    settings.clear();
    const opts = await resolveHomepageDisplay({
      posts: [],
      totalCount: 0,
      searchParams: undefined,
      routePath: "/",
      display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
    });
    expect(opts.layout).toBe("grid");
    expect(opts.limit).toBe(12);
    expect(opts.pagination).toBeNull();
  });

  it("builds pagination object when enabled and totalCount exceeds limit", async () => {
    settings.clear();
    settings.set("content.home_pagination_enabled", true);
    settings.set("content.home_limit", 5);
    const opts = await resolveHomepageDisplay({
      posts: [],
      totalCount: 23,
      searchParams: { page: "2" },
      routePath: "/",
      display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
    });
    expect(opts.pagination).not.toBeNull();
    expect(opts.pagination!.totalPages).toBe(5);
    expect(opts.pagination!.currentPage).toBe(2);
    expect(opts.pagination!.linkFor(1)).toBe("/");
    expect(opts.pagination!.linkFor(3)).toBe("/?page=3");
  });

  it("clamps out-of-range page to last valid page", async () => {
    settings.clear();
    settings.set("content.home_pagination_enabled", true);
    settings.set("content.home_limit", 5);
    const opts = await resolveHomepageDisplay({
      posts: [],
      totalCount: 12,
      searchParams: { page: "999" },
      routePath: "/",
      display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
    });
    expect(opts.pagination!.totalPages).toBe(3);
    expect(opts.pagination!.currentPage).toBe(3);
  });

  it("falls back to page 1 for non-numeric searchParams.page", async () => {
    settings.clear();
    settings.set("content.home_pagination_enabled", true);
    settings.set("content.home_limit", 5);
    const opts = await resolveHomepageDisplay({
      posts: [],
      totalCount: 12,
      searchParams: { page: "foo" },
      routePath: "/",
      display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
    });
    expect(opts.pagination!.currentPage).toBe(1);
  });
});
