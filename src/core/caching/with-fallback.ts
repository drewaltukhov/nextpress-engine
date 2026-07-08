/**
 * Run a Next.js `unstable_cache`-wrapped fn, but transparently bypass to a
 * direct fetch when the Next data-cache layer isn't initialised (vitest,
 * standalone scripts, anything outside the Next runtime).
 *
 * unstable_cache throws `"Invariant: incrementalCache missing in unstable_cache"`
 * when called outside a request scope where the cache store isn't set up.
 * We catch that one specific invariant and fall back; any other error is
 * re-thrown unchanged.
 *
 * After the first bypass in a process, we latch the result so subsequent
 * calls skip the throw-and-catch round trip.
 */
let cacheUnavailable = false;

export async function cacheOrFallback<T>(
  cached: () => Promise<T>,
  fallback: () => Promise<T>,
): Promise<T> {
  if (cacheUnavailable) return fallback();
  try {
    return await cached();
  } catch (err) {
    if (err instanceof Error && err.message.includes("incrementalCache missing")) {
      cacheUnavailable = true;
      return fallback();
    }
    throw err;
  }
}
