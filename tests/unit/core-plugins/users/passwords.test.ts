import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  checkStrength,
  enforceMinStrength,
  PasswordTooWeakError
} from "@core-plugins/users/passwords";

describe("hashPassword + verifyPassword", () => {
  it("roundtrips a correct password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-Staple-7!");
    expect(hash.startsWith("$argon2id$")).toBe(true);
    expect(await verifyPassword("Correct-Horse-Battery-Staple-7!", hash)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const hash = await hashPassword("Correct-Horse-Battery-Staple-7!");
    expect(await verifyPassword("not-the-password", hash)).toBe(false);
  });

  it("rejects malformed hashes without throwing", async () => {
    expect(await verifyPassword("anything", "not-a-real-hash")).toBe(false);
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("refuses to hash an empty string", async () => {
    await expect(hashPassword("")).rejects.toThrow();
  });
});

describe("checkStrength", () => {
  it("scores trivially-bad passwords low", () => {
    expect(checkStrength("123456").score).toBeLessThanOrEqual(1);
    expect(checkStrength("password").score).toBeLessThanOrEqual(1);
  });

  it("scores a strong unique passphrase ≥ 3", () => {
    expect(checkStrength("Correct-Horse-Battery-Staple-7!").score).toBeGreaterThanOrEqual(3);
  });

  it("penalizes passwords derived from user inputs", () => {
    const a = checkStrength("HelloDrew2026", []);
    const b = checkStrength("HelloDrew2026", ["drew@example.com", "Drew Altukhov"]);
    expect(b.score).toBeLessThanOrEqual(a.score);
  });
});

describe("enforceMinStrength", () => {
  it("throws PasswordTooWeakError for low scores", () => {
    expect(() => enforceMinStrength("123456")).toThrow(PasswordTooWeakError);
  });

  it("does not throw for a score >= 3", () => {
    expect(() => enforceMinStrength("Correct-Horse-Battery-Staple-7!")).not.toThrow();
  });

  it("respects a custom minScore", () => {
    expect(() => enforceMinStrength("hello-world", [], 1)).not.toThrow();
    expect(() => enforceMinStrength("hello-world", [], 4)).toThrow(PasswordTooWeakError);
  });
});
