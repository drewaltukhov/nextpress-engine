/**
 * Password hashing + strength checks for the credentials auth path.
 *
 * - `hashPassword(plain)` → argon2id with OWASP-recommended params.
 * - `verifyPassword(plain, hash)` → constant-time verify against an encoded hash.
 * - `checkStrength(plain, userInputs?)` → zxcvbn score 0-4 + reasons.
 * - `enforceMinStrength(plain, userInputs?, minScore?)` → throws PasswordTooWeakError when below threshold.
 */
import { hash, verify, type Options } from "@node-rs/argon2";
import zxcvbn from "zxcvbn";

// OWASP 2023 recommended argon2id baseline; tuned for low-CPU serverless without becoming sluggish.
// memoryCost in KiB; timeCost in iterations; parallelism = lanes.
const ARGON2_OPTIONS: Options = {
  memoryCost: 19 * 1024,
  timeCost: 2,
  parallelism: 1
};

export const DEFAULT_MIN_STRENGTH_SCORE = 3 as const;

export class PasswordTooWeakError extends Error {
  readonly score: number;
  readonly warning: string;
  readonly suggestions: readonly string[];

  constructor(score: number, warning: string, suggestions: readonly string[]) {
    super(`Password too weak (zxcvbn score ${score}). ${warning || "Choose a stronger password."}`);
    this.name = "PasswordTooWeakError";
    this.score = score;
    this.warning = warning;
    this.suggestions = suggestions;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("hashPassword: plain must be a non-empty string.");
  }
  return hash(plain, ARGON2_OPTIONS);
}

export async function verifyPassword(plain: string, encodedHash: string): Promise<boolean> {
  if (typeof plain !== "string" || typeof encodedHash !== "string") return false;
  if (plain.length === 0 || encodedHash.length === 0) return false;
  try {
    return await verify(encodedHash, plain);
  } catch {
    // Malformed hash, wrong algo, or other internal error → treat as a failed match.
    return false;
  }
}

export interface StrengthResult {
  score: 0 | 1 | 2 | 3 | 4;
  warning: string;
  suggestions: readonly string[];
}

/**
 * Run zxcvbn against the password.
 * `userInputs` provides context (email, display name) so the strength check
 * penalizes passwords that are derived from those values.
 */
export function checkStrength(plain: string, userInputs: readonly string[] = []): StrengthResult {
  const result = zxcvbn(plain, [...userInputs]);
  return {
    score: result.score as 0 | 1 | 2 | 3 | 4,
    warning: result.feedback.warning,
    suggestions: result.feedback.suggestions
  };
}

export function enforceMinStrength(
  plain: string,
  userInputs: readonly string[] = [],
  minScore: number = DEFAULT_MIN_STRENGTH_SCORE
): void {
  const r = checkStrength(plain, userInputs);
  if (r.score < minScore) {
    throw new PasswordTooWeakError(r.score, r.warning, r.suggestions);
  }
}
