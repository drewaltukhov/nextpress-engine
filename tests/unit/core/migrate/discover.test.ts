import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverPluginMigrations } from "@core/migrate/discover";

describe("discoverPluginMigrations", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "nextpress-mig-"));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns SQL files in lexical order", () => {
    mkdirSync(join(dir, "plugin-a"), { recursive: true });
    writeFileSync(join(dir, "plugin-a", "002_add_col.sql"), "ALTER TABLE x ADD c INTEGER;");
    writeFileSync(join(dir, "plugin-a", "001_init.sql"), "CREATE TABLE x (id INTEGER);");
    writeFileSync(join(dir, "plugin-a", "README.md"), "ignored");

    const result = discoverPluginMigrations({ pluginSlug: "plugin-a", dir: join(dir, "plugin-a") });

    expect(result.map((m) => m.fileName)).toEqual(["001_init.sql", "002_add_col.sql"]);
    expect(result[0].pluginSlug).toBe("plugin-a");
    expect(result[0].sql).toContain("CREATE TABLE x");
    expect(result[0].checksum).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns an empty array when the directory does not exist", () => {
    const result = discoverPluginMigrations({ pluginSlug: "missing", dir: join(dir, "missing") });
    expect(result).toEqual([]);
  });

  it("ignores non-.sql files", () => {
    mkdirSync(join(dir, "p"), { recursive: true });
    writeFileSync(join(dir, "p", "001_init.sql"), "SELECT 1;");
    writeFileSync(join(dir, "p", "001_init.bak"), "SELECT 1;");
    writeFileSync(join(dir, "p", "notes.txt"), "x");
    const result = discoverPluginMigrations({ pluginSlug: "p", dir: join(dir, "p") });
    expect(result.map((m) => m.fileName)).toEqual(["001_init.sql"]);
  });
});
