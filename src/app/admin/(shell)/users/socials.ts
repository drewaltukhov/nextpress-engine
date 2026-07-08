// Pure catalog of social platforms — used both server-side (when reading
// and writing meta.socials) and client-side (rendering the input fields).

export interface SocialPlatform {
  id: string;
  label: string;
  placeholder: string;
}

export const SOCIAL_PLATFORMS: ReadonlyArray<SocialPlatform> = [
  { id: "facebook", label: "Facebook", placeholder: "https://facebook.com/username" },
  { id: "x", label: "X (Twitter)", placeholder: "https://x.com/username" },
  { id: "youtube", label: "YouTube", placeholder: "https://youtube.com/@channel" },
  { id: "linkedin", label: "LinkedIn", placeholder: "https://linkedin.com/in/username" },
  { id: "whatsapp", label: "WhatsApp", placeholder: "+1 555 123 4567" },
  { id: "telegram", label: "Telegram", placeholder: "@username or t.me/username" },
];

export type Socials = Record<string, string>;

export function emptySocials(): Socials {
  const m: Socials = {};
  for (const p of SOCIAL_PLATFORMS) m[p.id] = "";
  return m;
}

// Strip unknown keys, trim values, drop empty strings — what we actually
// want to persist into meta.socials.
export function normalizeSocials(input: unknown): Socials {
  const out: Socials = {};
  if (input == null || typeof input !== "object") return out;
  const known = new Set(SOCIAL_PLATFORMS.map((p) => p.id));
  for (const [key, raw] of Object.entries(input as Record<string, unknown>)) {
    if (!known.has(key)) continue;
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) out[key] = trimmed.slice(0, 500);
  }
  return out;
}
