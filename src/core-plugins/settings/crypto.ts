/**
 * AES-256-GCM encryption for site_settings with encrypted=true.
 *
 * Key derived from AUTH_SECRET env var via SHA-256.
 * Stored format: { ciphertext, iv, authTag, keyVersion }
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const KEY_VERSION = 1;
const ALGO = "aes-256-gcm" as const;

function deriveKey(secret: string): Buffer {
  return createHash("sha256").update(secret).digest();
}

export interface EncryptedPayload {
  ciphertext: string;   // base64
  iv: string;           // base64
  authTag: string;      // base64
  keyVersion: number;
}

export function encrypt(plaintext: string, secret: string): EncryptedPayload {
  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    authTag: authTag.toString("base64"),
    keyVersion: KEY_VERSION
  };
}

export function decrypt(payload: EncryptedPayload, secret: string): string {
  const key = deriveKey(secret);
  const iv = Buffer.from(payload.iv, "base64");
  const authTag = Buffer.from(payload.authTag, "base64");
  const ciphertext = Buffer.from(payload.ciphertext, "base64");

  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(authTag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}
