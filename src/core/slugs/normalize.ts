/**
 * Normalize a user-supplied slug: lowercase, ASCII-fold diacritics,
 * collapse whitespace and other non-alphanumerics into single dashes,
 * trim leading/trailing dashes.
 */
export function normalizeSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function stripTrailingSlash(path: string): string {
  if (path === "/") return path;
  return path.endsWith("/") ? path.slice(0, -1) : path;
}
