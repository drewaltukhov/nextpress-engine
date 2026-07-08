import { describe, it, expect } from "vitest";
import { restoreDatabase } from "@core/backup/importer";
import { freshTestDb } from "../../helpers/test-db";

describe("restoreDatabase cascade ordering", () => {
  it("survives an ON DELETE CASCADE child->parent that iterates alphabetically before its parent", async () => {
    const db = freshTestDb();
    // `menu_items` is alphabetically before `menus`. menu_items.menu_id
    // FKs menus.id ON DELETE CASCADE — exact shape of the demo-bundle bug.
    await db.execute({
      sql: `CREATE TABLE menus (id INTEGER PRIMARY KEY, name TEXT)`,
      args: [],
    });
    await db.execute({
      sql: `CREATE TABLE menu_items (
        id INTEGER PRIMARY KEY,
        menu_id INTEGER NOT NULL,
        label TEXT NOT NULL,
        FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE
      )`,
      args: [],
    });

    // Object.entries returns keys in insertion order; sort alphabetically
    // to reproduce the wire-format ordering from a real bundle.
    const data: Record<string, Record<string, unknown>[]> = {};
    data.menu_items = [
      { id: 1, menu_id: 1, label: "Home" },
      { id: 2, menu_id: 1, label: "About" },
      { id: 3, menu_id: 2, label: "Footer link" },
    ];
    data.menus = [
      { id: 1, name: "Primary" },
      { id: 2, name: "Footer" },
    ];

    // Confirm iteration order matches the bug's: menu_items, then menus.
    expect(Object.keys(data)).toEqual(["menu_items", "menus"]);

    await restoreDatabase(db, data, "turso");

    const m = await db.execute({ sql: "SELECT COUNT(*) AS n FROM menus", args: [] });
    const mi = await db.execute({ sql: "SELECT COUNT(*) AS n FROM menu_items", args: [] });
    expect(Number(m.rows[0]!.n)).toBe(2);
    expect(Number(mi.rows[0]!.n)).toBe(3); // would be 0 with the old code
  });
});
