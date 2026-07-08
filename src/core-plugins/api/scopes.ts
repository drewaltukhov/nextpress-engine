/**
 * API token scopes — pure data, safe to import from client components.
 *
 * Kept in its own module so the client can read the list without dragging in
 * `tokens.ts` (which imports node:crypto for hashing).
 */
export const VALID_SCOPES = [
  "posts:read",
  "posts:write",
  "posts:delete",
  "media:read",
  "media:upload",
  "media:delete",
  "taxonomies:read",
  "taxonomies:write",
  "forms:read",
  "*",
] as const;

export type ApiScope = (typeof VALID_SCOPES)[number];

/**
 * Check if a token's scopes satisfy a required scope.
 * Wildcard `*` satisfies any scope.
 */
export function hasScope(tokenScopes: string[], required: string): boolean {
  return tokenScopes.includes("*") || tokenScopes.includes(required);
}
