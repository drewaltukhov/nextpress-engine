import { describe, it, expectTypeOf } from "vitest";
import type { DbAdminClient, DbPublicClient } from "@core/db/types";

/**
 * Type-only test: the `DbPublicClient` Pick narrowing in src/core/db/types.ts
 * is the COMPILE-TIME wall protecting render-path code from accidentally
 * writing to the database. If this test breaks, the wall is broken.
 *
 * Runtime backstop: the `nextpress_public` Postgres role lacks DML grants,
 * so the same call would also raise `permission denied` at the database.
 * Verified by tests/integration/db/public-role.pg.test.ts (Supabase mode).
 */
describe("DbPublicClient type narrowing", () => {
  it("exposes `select`", () => {
    type T = "select" extends keyof DbPublicClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<true>();
  });

  it("exposes `$with` (for CTEs)", () => {
    type T = "$with" extends keyof DbPublicClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<true>();
  });

  it("does NOT expose `insert`", () => {
    type T = "insert" extends keyof DbPublicClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<false>();
  });

  it("does NOT expose `update`", () => {
    type T = "update" extends keyof DbPublicClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<false>();
  });

  it("does NOT expose `delete`", () => {
    type T = "delete" extends keyof DbPublicClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<false>();
  });

  it("does NOT expose `execute` (raw SQL backdoor)", () => {
    type T = "execute" extends keyof DbPublicClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<false>();
  });

  it("DbAdminClient still exposes `insert` (sanity check — the wall is one-way)", () => {
    type T = "insert" extends keyof DbAdminClient ? true : false;
    expectTypeOf<T>().toEqualTypeOf<true>();
  });
});
