import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { resolveAdminPath } from "@core/auth/admin-path";

const OLD_ENV = process.env.NEXTPRESS_ADMIN_PATH;

describe("resolveAdminPath", () => {
  beforeEach(() => {
    delete process.env.NEXTPRESS_ADMIN_PATH;
  });
  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.NEXTPRESS_ADMIN_PATH;
    else process.env.NEXTPRESS_ADMIN_PATH = OLD_ENV;
  });

  it("returns /admin when env unset and db value is empty/null", () => {
    expect(resolveAdminPath({ envValue: undefined, dbValue: null })).toBe("/admin");
    expect(resolveAdminPath({ envValue: undefined, dbValue: "" })).toBe("/admin");
    expect(resolveAdminPath({ envValue: undefined, dbValue: "  " })).toBe("/admin");
  });

  it("returns db value when env unset and db is a valid slug", () => {
    expect(resolveAdminPath({ envValue: undefined, dbValue: "/cp-x" })).toBe("/cp-x");
  });

  it("env wins over db", () => {
    expect(resolveAdminPath({ envValue: "/admin", dbValue: "/cp-x" })).toBe("/admin");
    expect(resolveAdminPath({ envValue: "/forced", dbValue: "/cp-x" })).toBe("/forced");
  });

  it("trims whitespace in env value", () => {
    expect(resolveAdminPath({ envValue: "  /cp-x  ", dbValue: null })).toBe("/cp-x");
  });

  it("ignores an invalid db value and falls back to /admin", () => {
    expect(resolveAdminPath({ envValue: undefined, dbValue: "bogus no slash" })).toBe("/admin");
    expect(resolveAdminPath({ envValue: undefined, dbValue: "/Admin" })).toBe("/admin");
  });

  it("ignores an invalid env value and falls back to db (or default)", () => {
    expect(resolveAdminPath({ envValue: "no-slash", dbValue: "/cp-x" })).toBe("/cp-x");
    expect(resolveAdminPath({ envValue: "no-slash", dbValue: null })).toBe("/admin");
  });
});
