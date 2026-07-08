import { describe, it, expect } from "vitest";
import { isAdminOnlyRoute, ADMIN_ONLY_ROUTE_PREFIXES } from "@core/auth/admin-routes";

describe("isAdminOnlyRoute", () => {
  it("matches an exact prefix", () => {
    expect(isAdminOnlyRoute("/admin/settings")).toBe(true);
    expect(isAdminOnlyRoute("/admin/users")).toBe(true);
    expect(isAdminOnlyRoute("/admin/logs")).toBe(true);
  });

  it("matches a child path under a prefix", () => {
    expect(isAdminOnlyRoute("/admin/users/new")).toBe(true);
    expect(isAdminOnlyRoute("/admin/users/abc-123/edit")).toBe(true);
    expect(isAdminOnlyRoute("/admin/plugins/weather")).toBe(true);
    expect(isAdminOnlyRoute("/admin/settings/website")).toBe(true);
  });

  it("does not match the dashboard", () => {
    expect(isAdminOnlyRoute("/admin")).toBe(false);
    expect(isAdminOnlyRoute("/admin/")).toBe(false);
  });

  it("does not match content routes accessible to non-admins", () => {
    expect(isAdminOnlyRoute("/admin/media")).toBe(false);
    expect(isAdminOnlyRoute("/admin/media/abc/edit")).toBe(false);
    expect(isAdminOnlyRoute("/admin/profile")).toBe(false);
  });

  it("does not match siblings that share a prefix substring", () => {
    // /admin/users vs a hypothetical /admin/usersfoo — the latter must not match.
    expect(isAdminOnlyRoute("/admin/usersfoo")).toBe(false);
    expect(isAdminOnlyRoute("/admin/settingsbar")).toBe(false);
  });

  it("does not match unrelated paths", () => {
    expect(isAdminOnlyRoute("/admin/login")).toBe(false);
    expect(isAdminOnlyRoute("/admin/setup")).toBe(false);
    expect(isAdminOnlyRoute("/admin/forgot-password")).toBe(false);
    expect(isAdminOnlyRoute("/")).toBe(false);
    expect(isAdminOnlyRoute("/api/v1/me")).toBe(false);
  });

  it("covers all declared prefixes", () => {
    for (const prefix of ADMIN_ONLY_ROUTE_PREFIXES) {
      expect(isAdminOnlyRoute(prefix)).toBe(true);
      expect(isAdminOnlyRoute(`${prefix}/anything`)).toBe(true);
    }
  });
});
