import { describe, it, expect } from "vitest";
import { sha256 } from "@core/migrate/checksum";

describe("checksum", () => {
  it("returns a 64-char hex SHA-256", () => {
    const hash = sha256("CREATE TABLE foo (id INTEGER PRIMARY KEY);");
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    expect(sha256("hello")).toBe(sha256("hello"));
  });

  it("is whitespace-sensitive", () => {
    expect(sha256("hello")).not.toBe(sha256("hello "));
  });
});
