import { describe, it, expect } from "vitest";
import { decideHideAdminAction } from "@core/auth/admin-path-decision";

describe("decideHideAdminAction", () => {
  describe("when slug equals /admin (hide off)", () => {
    it("passes every request through unchanged", () => {
      const cases = ["/", "/admin", "/admin/login", "/admin/posts", "/blog/x"];
      for (const p of cases) {
        expect(decideHideAdminAction({ pathname: p, slug: "/admin", isAuth: false }))
          .toEqual({ kind: "pass" });
      }
    });
  });

  describe("when slug is /cp-x (hide on)", () => {
    const slug = "/cp-x";

    it("rewrites the slug to /admin/login when unauth", () => {
      expect(decideHideAdminAction({ pathname: "/cp-x", slug, isAuth: false }))
        .toEqual({ kind: "rewrite", target: "/admin/login" });
    });

    it("redirects the slug to /admin when already authenticated", () => {
      expect(decideHideAdminAction({ pathname: "/cp-x", slug, isAuth: true }))
        .toEqual({ kind: "redirect", target: "/admin" });
    });

    it("blocks /admin literally (unauth) with 404", () => {
      expect(decideHideAdminAction({ pathname: "/admin", slug, isAuth: false }))
        .toEqual({ kind: "block" });
    });

    it("blocks /admin/login literally (unauth) with 404", () => {
      expect(decideHideAdminAction({ pathname: "/admin/login", slug, isAuth: false }))
        .toEqual({ kind: "block" });
    });

    it("blocks /admin/* sub-paths (unauth) with 404", () => {
      for (const p of ["/admin/posts", "/admin/users/new", "/admin/api-tokens"]) {
        expect(decideHideAdminAction({ pathname: p, slug, isAuth: false }))
          .toEqual({ kind: "block" });
      }
    });

    it("passes the allowlist through unauth (email links + setup)", () => {
      const allowlist = [
        "/admin/reset-password",
        "/admin/reset-password/abc-123",
        "/admin/forgot-password",
        "/admin/confirm-email",
        "/admin/confirm-email/token",
        "/admin/setup",
        "/admin/setup/db",
      ];
      for (const p of allowlist) {
        expect(decideHideAdminAction({ pathname: p, slug, isAuth: false }))
          .toEqual({ kind: "pass" });
      }
    });

    it("blocks allowlist sibling-prefix bypasses", () => {
      // These look like the allowlist but aren't — bare startsWith() would
      // wrongly allow them through. The matcher must require exact-equal
      // OR `prefix + "/"`.
      const bypasses = [
        "/admin/setupthing",
        "/admin/reset-password-attack",
        "/admin/forgot-password-extra",
        "/admin/confirm-emails",
      ];
      for (const p of bypasses) {
        expect(decideHideAdminAction({ pathname: p, slug, isAuth: false }))
          .toEqual({ kind: "block" });
      }
    });

    it("passes /admin/* through when authenticated", () => {
      for (const p of ["/admin", "/admin/posts", "/admin/users"]) {
        expect(decideHideAdminAction({ pathname: p, slug, isAuth: true }))
          .toEqual({ kind: "pass" });
      }
    });

    it("ignores siblings that share a prefix substring", () => {
      // /admin vs /administrator — the latter is public, untouched.
      expect(decideHideAdminAction({ pathname: "/administrator", slug, isAuth: false }))
        .toEqual({ kind: "pass" });
      // /cp-x vs /cp-x-public
      expect(decideHideAdminAction({ pathname: "/cp-x-public", slug, isAuth: false }))
        .toEqual({ kind: "pass" });
    });

    it("does not block public paths", () => {
      for (const p of ["/", "/blog/post", "/api/v1/posts", "/sitemap.xml"]) {
        expect(decideHideAdminAction({ pathname: p, slug, isAuth: false }))
          .toEqual({ kind: "pass" });
      }
    });
  });
});
