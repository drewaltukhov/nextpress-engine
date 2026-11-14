/**
 * Geo-IP lookup — always returns null. Callers pass the platform's edge
 * country header as countryHint (getClientCountry in @core/net/client-ip:
 * x-vercel-ip-country on Vercel, cf-ipcountry elsewhere); without it the
 * country is null, which fails open by design.
 */
export async function countryFor(_ip: string): Promise<string | null> {
  return null;
}

/**
 * Parse a newline-or-comma separated list of ISO codes into an upper-cased
 * Set. Used for matching against the country filter list.
 */
export function parseCountryCodes(raw: string): Set<string> {
  return new Set(
    raw
      .split(/[\n,]/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s))
  );
}
