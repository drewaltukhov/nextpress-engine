import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { freshTestDb } from "../../helpers/test-db";
import {
  applyMigrations,
  planMigrations,
  migrationStatus,
  rollbackMigration,
  splitStatements
} from "@core/migrate/runner";
import type { DbClient } from "@core/db/client";

function writeMigration(dir: string, name: string, sql: string) {
  writeFileSync(join(dir, name), sql);
}

describe("applyMigrations", () => {
  let db: DbClient;
  let migrationsRoot: string;

  beforeEach(() => {
    db = freshTestDb();
    migrationsRoot = mkdtempSync(join(tmpdir(), "nextpress-runner-"));
  });

  it("applies a single migration and records it in migrations_log", async () => {
    const pluginDir = join(migrationsRoot, "alpha");
    mkdirSync(pluginDir, { recursive: true });
    writeMigration(pluginDir, "001_init.sql", "CREATE TABLE alpha_widgets (id INTEGER PRIMARY KEY);");

    const result = await applyMigrations({
      db,
      plugins: [{ slug: "alpha", migrationsDir: pluginDir }],
      owner: "test"
    });

    expect(result.applied.length).toBe(1);
    expect(result.applied[0].pluginSlug).toBe("alpha");
    expect(result.applied[0].fileName).toBe("001_init.sql");

    const log = await db.execute("SELECT plugin_slug, migration_name FROM migrations_log");
    expect(log.rows).toEqual([{ plugin_slug: "alpha", migration_name: "001_init.sql" }]);

    const widgets = await db.execute(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='alpha_widgets'"
    );
    expect(widgets.rows.length).toBe(1);
  });

  it("is idempotent — re-running applies nothing new", async () => {
    const pluginDir = join(migrationsRoot, "beta");
    mkdirSync(pluginDir, { recursive: true });
    writeMigration(pluginDir, "001_init.sql", "CREATE TABLE beta (id INTEGER PRIMARY KEY);");

    await applyMigrations({ db, plugins: [{ slug: "beta", migrationsDir: pluginDir }], owner: "test" });
    const second = await applyMigrations({
      db,
      plugins: [{ slug: "beta", migrationsDir: pluginDir }],
      owner: "test"
    });
    expect(second.applied.length).toBe(0);
    expect(second.skipped.length).toBe(1);
  });

  it("rejects a checksum-drifted migration", async () => {
    const pluginDir = join(migrationsRoot, "gamma");
    mkdirSync(pluginDir, { recursive: true });
    writeMigration(pluginDir, "001_init.sql", "CREATE TABLE gamma (id INTEGER PRIMARY KEY);");
    await applyMigrations({ db, plugins: [{ slug: "gamma", migrationsDir: pluginDir }], owner: "test" });

    writeMigration(pluginDir, "001_init.sql", "CREATE TABLE gamma (id INTEGER PRIMARY KEY, name TEXT);");

    const result = await applyMigrations({
      db,
      plugins: [{ slug: "gamma", migrationsDir: pluginDir }],
      owner: "test"
    });
    expect(result.failures.length).toBe(1);
    expect(result.failures[0].error).toMatch(/checksum/i);
  });

  it("isolates a plugin's failed migration — other plugins still apply", async () => {
    const aDir = join(migrationsRoot, "good");
    mkdirSync(aDir, { recursive: true });
    writeMigration(aDir, "001_init.sql", "CREATE TABLE good_t (id INTEGER PRIMARY KEY);");

    const bDir = join(migrationsRoot, "bad");
    mkdirSync(bDir, { recursive: true });
    writeMigration(bDir, "001_init.sql", "INVALID SQL HERE;");

    const result = await applyMigrations({
      db,
      plugins: [
        { slug: "good", migrationsDir: aDir },
        { slug: "bad", migrationsDir: bDir }
      ],
      owner: "test"
    });

    expect(result.applied.map((a) => a.pluginSlug)).toEqual(["good"]);
    expect(result.failures.map((f) => f.pluginSlug)).toEqual(["bad"]);
  });

  it("refuses to run when the lock is held", async () => {
    await db.execute(`
      CREATE TABLE migration_lock (id INTEGER PRIMARY KEY, locked_at TEXT NOT NULL, owner TEXT NOT NULL);
    `);
    await db.execute({
      sql: "INSERT INTO migration_lock (id, locked_at, owner) VALUES (1, ?, ?)",
      args: [new Date().toISOString(), "other-runner"]
    });

    const result = await applyMigrations({ db, plugins: [], owner: "test" });
    expect(result.lockHeld).toBe(true);
    expect(result.heldBy).toBe("other-runner");
  });
});

describe("planMigrations (dry-run)", () => {
  it("returns pending migrations without applying them", async () => {
    const db = freshTestDb();
    const root = mkdtempSync(join(tmpdir(), "nextpress-plan-"));
    const dir = join(root, "alpha");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "001_init.sql"), "CREATE TABLE alpha (id INTEGER PRIMARY KEY);");

    const plan = await planMigrations({ db, plugins: [{ slug: "alpha", migrationsDir: dir }] });

    expect(plan.pending.map((p) => p.fileName)).toEqual(["001_init.sql"]);

    const t = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alpha'");
    expect(t.rows.length).toBe(0);
  });
});

describe("migrationStatus", () => {
  it("groups applied vs pending per plugin", async () => {
    const db = freshTestDb();
    const root = mkdtempSync(join(tmpdir(), "nextpress-status-"));
    const dir = join(root, "alpha");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "001_init.sql"), "CREATE TABLE alpha (id INTEGER PRIMARY KEY);");
    writeFileSync(join(dir, "002_more.sql"), "CREATE TABLE alpha2 (id INTEGER PRIMARY KEY);");

    await applyMigrations({
      db,
      plugins: [{ slug: "alpha", migrationsDir: dir }],
      owner: "test"
    });
    writeFileSync(join(dir, "003_yet.sql"), "CREATE TABLE alpha3 (id INTEGER PRIMARY KEY);");

    const status = await migrationStatus({ db, plugins: [{ slug: "alpha", migrationsDir: dir }] });
    expect(status.byPlugin.alpha.applied.length).toBe(2);
    expect(status.byPlugin.alpha.pending.map((p) => p.fileName)).toEqual(["003_yet.sql"]);
  });
});

describe("splitStatements", () => {
  it("keeps statements that have a leading -- comment line", () => {
    const sql =
      "CREATE TABLE foo (id INTEGER);--> statement-breakpoint\n" +
      "-- this is a comment\n" +
      "INSERT INTO foo (id) VALUES (1);--> statement-breakpoint\n" +
      "INSERT INTO foo (id) VALUES (2);";
    const stmts = splitStatements(sql);
    expect(stmts).toEqual([
      "CREATE TABLE foo (id INTEGER);",
      "INSERT INTO foo (id) VALUES (1);",
      "INSERT INTO foo (id) VALUES (2);"
    ]);
  });

  it("drops a chunk that is only whitespace + comments", () => {
    const sql =
      "CREATE TABLE foo (id INTEGER);--> statement-breakpoint\n" +
      "-- a header comment, no SQL after\n" +
      "--> statement-breakpoint\n" +
      "INSERT INTO foo (id) VALUES (1);";
    const stmts = splitStatements(sql);
    expect(stmts).toEqual([
      "CREATE TABLE foo (id INTEGER);",
      "INSERT INTO foo (id) VALUES (1);"
    ]);
  });
});

describe("rollbackMigration", () => {
  it("removes the row from migrations_log without running SQL", async () => {
    const db = freshTestDb();
    const root = mkdtempSync(join(tmpdir(), "nextpress-rollback-"));
    const dir = join(root, "alpha");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "001_init.sql"), "CREATE TABLE alpha (id INTEGER PRIMARY KEY);");

    await applyMigrations({
      db,
      plugins: [{ slug: "alpha", migrationsDir: dir }],
      owner: "test"
    });

    const result = await rollbackMigration({ db, pluginSlug: "alpha", fileName: "001_init.sql" });
    expect(result.removed).toBe(true);

    const log = await db.execute("SELECT * FROM migrations_log");
    expect(log.rows.length).toBe(0);

    const t = await db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='alpha'");
    expect(t.rows.length).toBe(1);
  });

  it("returns removed=false when the row didn't exist", async () => {
    const db = freshTestDb();
    await db.execute(`
      CREATE TABLE migrations_log (
        plugin_slug TEXT NOT NULL, migration_name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        applied_by TEXT, execution_ms INTEGER, checksum TEXT NOT NULL,
        PRIMARY KEY (plugin_slug, migration_name)
      )
    `);
    const result = await rollbackMigration({ db, pluginSlug: "ghost", fileName: "001_init.sql" });
    expect(result.removed).toBe(false);
  });
});
