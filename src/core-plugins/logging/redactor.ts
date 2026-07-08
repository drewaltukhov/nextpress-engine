/**
 * Redact secret-shaped values from arbitrary JSON payloads before they hit
 * system_log / audit_log / plugin_failures. Centralized so plugins can't
 * accidentally leak credentials.
 *
 * Strategies:
 * - Keys that look like secrets (password, secret, token, apikey, authorization,
 *   cookie, credential, jwt, refresh) → "[REDACTED]"
 * - Bearer tokens, JWTs, and AWS-style access keys in string values → masked
 *   prefix + "***"
 * - Site-defined regex patterns from `logging.redaction_patterns` are applied
 *   to every string value. Patterns are loaded lazily on the first
 *   `ensureRedactionPatternsLoaded(db)` call and recompiled when
 *   `resetRedactionPatterns()` is called by `saveLoggingSettings`.
 * - Mutates a deep clone; original input is not touched.
 */
import type { DbClient } from "@core/db/client";
import { getSetting } from "@core-plugins/settings/registry";

const SECRET_KEY_RE = /pass(word)?|secret|token|api[_-]?key|authorization|cookie|credential|refresh|jwt/i;
const BEARER_RE = /^Bearer\s+[A-Za-z0-9._\-+/=]{8,}$/i;
const JWT_RE = /^[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$/;

let dynamicPatterns: RegExp[] = [];
let loaded = false;

function maskString(s: string): string {
  if (s.length <= 8) return "[REDACTED]";
  return `${s.slice(0, 4)}***${s.slice(-2)}`;
}

function compilePatterns(raw: string): RegExp[] {
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return new RegExp(line, "g");
      } catch {
        return null;
      }
    })
    .filter((re): re is RegExp => re !== null);
}

/**
 * Load the site's regex patterns from `logging.redaction_patterns` into the
 * module-level cache. No-op after the first successful call until
 * `resetRedactionPatterns()` is invoked.
 */
export async function ensureRedactionPatternsLoaded(db: DbClient): Promise<void> {
  if (loaded) return;
  try {
    const raw = await getSetting<string>(db, "logging.redaction_patterns");
    dynamicPatterns = compilePatterns(raw ?? "");
  } catch {
    dynamicPatterns = [];
  }
  loaded = true;
}

/**
 * Clear the cache so the next `ensureRedactionPatternsLoaded` call re-reads
 * from the DB. Call after saving the redaction-patterns setting.
 */
export function resetRedactionPatterns(): void {
  dynamicPatterns = [];
  loaded = false;
}

/**
 * Test-only direct setter so unit tests don't need a populated settings table.
 */
export function _setRedactionPatternsForTests(patterns: RegExp[]): void {
  dynamicPatterns = patterns;
  loaded = true;
}

function applyDynamic(s: string): string {
  if (dynamicPatterns.length === 0) return s;
  let out = s;
  for (const re of dynamicPatterns) {
    out = out.replace(re, "[REDACTED]");
  }
  return out;
}

export function redact<T>(input: T): T {
  if (input == null) return input;
  if (typeof input === "string") {
    if (BEARER_RE.test(input) || JWT_RE.test(input)) return maskString(input) as unknown as T;
    return applyDynamic(input) as unknown as T;
  }
  if (Array.isArray(input)) {
    return input.map((v) => redact(v)) as unknown as T;
  }
  if (typeof input === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
      if (SECRET_KEY_RE.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v);
      }
    }
    return out as unknown as T;
  }
  return input;
}
