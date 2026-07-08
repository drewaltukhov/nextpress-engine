import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readEnv } from "@core/env";

const ORIG = { ...process.env };

describe("readEnv", () => {
  beforeEach(() => {
    process.env = { ...ORIG };
  });
  afterEach(() => {
    process.env = ORIG;
  });

  it("returns local file URL when TURSO_DATABASE_URL is unset", () => {
    delete process.env.TURSO_DATABASE_URL;
    delete process.env.TURSO_AUTH_TOKEN;
    const env = readEnv();
    expect(env.databaseUrl).toBe("file:./.local/dev.db");
    expect(env.authToken).toBeUndefined();
  });

  it("uses TURSO_DATABASE_URL + TURSO_AUTH_TOKEN when set", () => {
    process.env.TURSO_DATABASE_URL = "libsql://x.turso.io";
    process.env.TURSO_AUTH_TOKEN = "tk-abc";
    const env = readEnv();
    expect(env.databaseUrl).toBe("libsql://x.turso.io");
    expect(env.authToken).toBe("tk-abc");
  });

  it("parses NEXTPRESS_DISABLE_PLUGINS as a comma-separated set", () => {
    process.env.NEXTPRESS_DISABLE_PLUGINS = "alpha, beta ,gamma";
    expect(readEnv().disabledPlugins).toEqual(new Set(["alpha", "beta", "gamma"]));
  });

  it("recognizes safe mode when NEXTPRESS_SAFE_MODE=1", () => {
    process.env.NEXTPRESS_SAFE_MODE = "1";
    expect(readEnv().safeMode).toBe(true);
    process.env.NEXTPRESS_SAFE_MODE = "0";
    expect(readEnv().safeMode).toBe(false);
  });
});

describe("Supabase provider mode", () => {
  beforeEach(() => {
    process.env = { ...ORIG };
    delete process.env.NEXTPRESS_DB_PROVIDER;
    delete process.env.DATABASE_URL;
    delete process.env.DATABASE_URL_PUBLIC;
  });
  afterEach(() => {
    process.env = ORIG;
  });

  it("defaults to turso when NEXTPRESS_DB_PROVIDER unset", () => {
    expect(readEnv().provider).toBe("turso");
  });

  it("selects supabase when provider flag is set + both URLs are present", () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL = "postgres://nextpress_admin:pw@host:6543/postgres";
    process.env.DATABASE_URL_PUBLIC = "postgres://nextpress_public:pw@host:6543/postgres";
    const env = readEnv();
    expect(env.provider).toBe("supabase");
    expect(env.databaseUrlAdmin).toMatch(/^postgres:\/\//);
    expect(env.databaseUrlPublic).toMatch(/^postgres:\/\//);
  });

  it("throws when supabase mode is set but DATABASE_URL is missing", () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL_PUBLIC = "postgres://a@b/c";
    expect(() => readEnv()).toThrow(/DATABASE_URL/);
  });

  it("throws when DATABASE_URL_PUBLIC is missing", () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL = "postgres://x@y/z";
    expect(() => readEnv()).toThrow(/DATABASE_URL_PUBLIC/);
  });

  it("throws when DATABASE_URL is not a postgres:// URL", () => {
    process.env.NEXTPRESS_DB_PROVIDER = "supabase";
    process.env.DATABASE_URL = "mysql://x@y/z";
    process.env.DATABASE_URL_PUBLIC = "postgres://a@b/c";
    expect(() => readEnv()).toThrow(/postgres/i);
  });

  it("leaves Supabase URL fields undefined when provider is turso", () => {
    delete process.env.NEXTPRESS_DB_PROVIDER;
    const env = readEnv();
    expect(env.provider).toBe("turso");
    expect(env.databaseUrlAdmin).toBeUndefined();
    expect(env.databaseUrlPublic).toBeUndefined();
  });
});
