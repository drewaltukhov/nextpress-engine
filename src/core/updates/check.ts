/**
 * Engine version check against the canonical NextPress GitHub repo.
 *
 * Fetches `/repos/{owner}/{repo}/tags` from GitHub, picks the highest
 * semver tag, compares against the project's pinned engine version,
 * and reports whether an upgrade is available. Cached via the
 * plugin-cache engine so repeated dashboard hits don't burn the
 * GitHub rate limit.
 *
 * The pinned engine version is read from `package.json.engineVersion`
 * when set — that's the convention downstream projects use to track
 * which NextPress release they consume, independent of their own
 * project version. When
 * `engineVersion` is absent, falls back to `package.json.version` so
 * the engine repo itself (where `version` IS the engine version) keeps
 * reporting correctly.
 *
 * Private-repo support: set GITHUB_TOKEN in .env.local. Without it,
 * private repos return 404 and the check reports a neutral
 * "couldn't reach GitHub" status — never a hard error. The dashboard
 * keeps rendering.
 */
import packageJson from "../../../package.json";
import { registerCache, getCached, invalidateCache } from "@core/cache/plugin-cache";
import type { DbClient } from "@core/db/client";

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  isLatest: boolean;
  releaseUrl: string | null;
  error: string | null;
  checkedAt: string;
}

const REPO_OWNER = process.env.NEXTPRESS_UPDATE_REPO_OWNER ?? "drewaltukhov";
const REPO_NAME = process.env.NEXTPRESS_UPDATE_REPO_NAME ?? "nextpress";
const CACHE_KEY = "core.update_check";
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function parseSemver(v: string): [number, number, number] | null {
  const m = v.replace(/^v/, "").match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareSemver(a: string, b: string): number {
  const pa = parseSemver(a);
  const pb = parseSemver(b);
  if (!pa || !pb) return 0;
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}

async function fetchLatest(): Promise<UpdateCheckResult> {
  // Prefer the pin set by downstream projects; fall back to the
  // engine repo's own version when run from the standalone repo.
  const pkg = packageJson as { version: string; engineVersion?: string };
  const current = pkg.engineVersion ?? pkg.version;
  const checkedAt = new Date().toISOString();
  const token = process.env.GITHUB_TOKEN?.trim();

  try {
    const res = await fetch(
      `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/tags?per_page=20`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        cache: "no-store"
      }
    );
    if (!res.ok) {
      const reason =
        res.status === 401
          ? token
            ? "Invalid GITHUB_TOKEN — refresh or remove it"
            : "GitHub rejected the request — set GITHUB_TOKEN"
          : res.status === 404
            ? token
              ? "Repo not reachable (token lacks access to this repo?)"
              : "Repo not reachable (private? set GITHUB_TOKEN)"
            : res.status === 403
              ? "GitHub API rate limit reached"
              : `GitHub responded ${res.status}`;
      return { current, latest: null, isLatest: false, releaseUrl: null, error: reason, checkedAt };
    }

    const tags = (await res.json()) as Array<{ name: string }>;
    const valid = tags.map((t) => t.name).filter((n) => parseSemver(n) !== null);
    if (valid.length === 0) {
      return { current, latest: null, isLatest: false, releaseUrl: null, error: "No version tags published", checkedAt };
    }

    valid.sort((a, b) => compareSemver(b, a));
    const latest = valid[0];
    const isLatest = compareSemver(current, latest) >= 0;
    const releaseUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/releases/tag/${latest}`;

    return { current, latest, isLatest, releaseUrl, error: null, checkedAt };
  } catch (err) {
    return {
      current,
      latest: null,
      isLatest: false,
      releaseUrl: null,
      error: err instanceof Error ? err.message : "Network error",
      checkedAt
    };
  }
}

/** Register the cache. Called once during bootEngine, before any reads. */
export function registerUpdateCheck(): void {
  registerCache({
    key: CACHE_KEY,
    ttlMs: CACHE_TTL_MS,
    fetcher: fetchLatest
  });
}

/** Read cached status. First call after boot blocks on the GitHub fetch (~500ms). */
export async function getUpdateStatus(db: DbClient): Promise<UpdateCheckResult | null> {
  return getCached<UpdateCheckResult>(CACHE_KEY, db);
}

/** Drop the cached value. Next read forces a fresh GitHub fetch. */
export function invalidateUpdateCheck(): void {
  invalidateCache(CACHE_KEY);
}
