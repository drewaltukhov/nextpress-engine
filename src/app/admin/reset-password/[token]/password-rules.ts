// Pure rule list used by both the live form checklist and the server action.
// Keep this file free of "use server" / next/headers / DB imports so it can
// be safely imported from a client component.

export interface PasswordRule {
  id: string;
  label: string;
  check: (pw: string) => boolean;
}

export const PASSWORD_RULES: ReadonlyArray<PasswordRule> = [
  { id: "length", label: "At least 8 characters", check: (pw) => pw.length >= 8 },
  { id: "lower", label: "Contains a lowercase letter", check: (pw) => /[a-z]/.test(pw) },
  { id: "upper", label: "Contains an uppercase letter", check: (pw) => /[A-Z]/.test(pw) },
  { id: "number", label: "Contains a number", check: (pw) => /[0-9]/.test(pw) },
  { id: "special", label: "Contains a special character", check: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function validatePassword(pw: string): { ok: true } | { ok: false; failed: string[] } {
  const failed = PASSWORD_RULES.filter((r) => !r.check(pw)).map((r) => r.label);
  return failed.length === 0 ? { ok: true } : { ok: false, failed };
}
