import { describe, it, expect } from "vitest";
import { validateAdminPath } from "@core/auth/admin-path-validator";

describe("validateAdminPath", () => {
  it("accepts a well-formed slug", () => {
    expect(validateAdminPath("/control-panel")).toEqual({ ok: true });
    expect(validateAdminPath("/cp_42")).toEqual({ ok: true });
    expect(validateAdminPath("/secret-room-9")).toEqual({ ok: true });
  });

  it("rejects empty / non-slash paths", () => {
    expect(validateAdminPath("").ok).toBe(false);
    expect(validateAdminPath("admin").ok).toBe(false);
    expect(validateAdminPath("/").ok).toBe(false);
  });

  it("rejects bad characters", () => {
    expect(validateAdminPath("/Admin").ok).toBe(false);
    expect(validateAdminPath("/cp space").ok).toBe(false);
    expect(validateAdminPath("/cp/sub").ok).toBe(false);
    expect(validateAdminPath("/cp.dot").ok).toBe(false);
  });

  it("rejects too-short / too-long", () => {
    expect(validateAdminPath("/ab").ok).toBe(false);
    expect(validateAdminPath("/" + "a".repeat(33)).ok).toBe(false);
    expect(validateAdminPath("/" + "a".repeat(32)).ok).toBe(true);
    expect(validateAdminPath("/abc").ok).toBe(true);
  });

  it("rejects reserved slugs", () => {
    for (const reserved of ["/admin", "/api", "/_next", "/docs", "/setup", "/login", "/blog", "/sitemap.xml", "/robots.txt", "/favicon.ico"]) {
      expect(validateAdminPath(reserved).ok).toBe(false);
    }
  });

  it("rejects a leading-digit slug", () => {
    expect(validateAdminPath("/9room").ok).toBe(false);
  });

  it("returns a reason string on failure", () => {
    const r = validateAdminPath("/admin");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/reserved/i);
  });
});
