import { describe, it, expect } from "vitest";
import { encrypt, decrypt } from "@core-plugins/settings/crypto";

const SECRET = "test-secret-key-for-encryption-32ch";

describe("encrypt / decrypt", () => {
  it("round-trips a string value", () => {
    const payload = encrypt("hello world", SECRET);
    const result = decrypt(payload, SECRET);
    expect(result).toBe("hello world");
  });

  it("round-trips a JSON value", () => {
    const obj = { password: "s3cret", port: 587 };
    const payload = encrypt(JSON.stringify(obj), SECRET);
    const result = JSON.parse(decrypt(payload, SECRET));
    expect(result).toEqual(obj);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const a = encrypt("same", SECRET);
    const b = encrypt("same", SECRET);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
  });

  it("fails to decrypt with wrong key", () => {
    const payload = encrypt("secret", SECRET);
    expect(() => decrypt(payload, "wrong-key-that-is-also-long-enough")).toThrow();
  });

  it("includes keyVersion in payload", () => {
    const payload = encrypt("test", SECRET);
    expect(payload.keyVersion).toBe(1);
  });
});
