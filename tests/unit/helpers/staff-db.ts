import { mkdtempSync, readdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createDbClient, type DbClient } from "@core/db/client";
import { applyMigrations } from "@core/migrate/runner";
import { resetProcessCaches } from "./test-db";

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  roles: string[];
}

export const STAFF = {
  admin: { id: "admin-1", name: "Ada", email: "ada@example.com", roles: ["admin"] },
  editor: { id: "editor-1", name: "Ed", email: "ed@example.com", roles: ["editor"] },
  author: { id: "author-1", name: "Al", email: "al@example.com", roles: ["author"] },
  author2: { id: "author-2", name: "Bea", email: "bea@example.com", roles: ["author"] },
} satisfies Record<string, StaffUser>;

/**
 * A throwaway, fully migrated database for server-action tests, with the
 * app's own `db()` pointed at it (server actions open their own client from
 * TURSO_DATABASE_URL). Seeds one user per staff role.
 *
 * Call at module top level, before importing any server action.
 */
export function staffDb(label: string): { db: DbClient; ready: Promise<void> } {
  const dir = mkdtempSync(join(tmpdir(), `nextpress-${label}-`));
  const url = `file:${join(dir, "test.db")}`;
  process.env.TURSO_DATABASE_URL = url;
  delete process.env.TURSO_AUTH_TOKEN;
  resetProcessCaches();
  const db = createDbClient({ databaseUrl: url, authToken: undefined });

  const ready = (async () => {
    const root = (p: string) => resolve(process.cwd(), p);
    const first = ["core", "users", "settings", "logging", "security"];
    const corePlugins = readdirSync(root("src/core-plugins")).filter((d) => existsSync(root(`src/core-plugins/${d}/migrations`)));
    const plugins = readdirSync(root("plugins")).filter((d) => existsSync(root(`plugins/${d}/migrations`)));
    const sources = [
      { slug: "core", migrationsDir: root("src/core/db/migrations/core") },
      ...first.slice(1).map((s) => ({ slug: s, migrationsDir: root(`src/core-plugins/${s}/migrations`) })),
      ...corePlugins.filter((s) => !first.includes(s)).sort().map((s) => ({ slug: s, migrationsDir: root(`src/core-plugins/${s}/migrations`) })),
      ...plugins.sort().map((s) => ({ slug: s, migrationsDir: root(`plugins/${s}/migrations`) })),
    ];
    const res = await applyMigrations({ db, owner: "test", plugins: sources });
    if (res.failures.length) throw new Error(JSON.stringify(res.failures));
    for (const u of Object.values(STAFF)) {
      await db.execute({ sql: "INSERT INTO users (id, email, display_name) VALUES (?, ?, ?)", args: [u.id, u.email, u.name] });
      await db.execute({ sql: "INSERT INTO user_roles (user_id, role_slug) VALUES (?, ?)", args: [u.id, u.roles[0]] });
    }
    resetProcessCaches();
  })();

  return { db, ready };
}
