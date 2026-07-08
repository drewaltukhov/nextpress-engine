/**
 * In-memory token-bucket rate limiter, keyed by api_token.id.
 *
 * Each token gets its own bucket with capacity = rate_limit_per_minute
 * (or site default 60). Tokens refill continuously. Burst allowance = 10.
 *
 * State is in-memory (lost on restart), which is fine for a single-process
 * Vercel deployment. A distributed rate limiter (Redis, Upstash) would be
 * needed for multi-instance deployments.
 */

export const DEFAULT_RATE_LIMIT = 60;
export const BURST_ALLOWANCE = 10;

interface Bucket {
  tokens: number;
  lastRefill: number;       // Date.now() ms
  capacity: number;
}

const buckets = new Map<number, Bucket>();

/**
 * Clean up old buckets periodically to prevent unbounded memory growth.
 * Buckets unused for >10 minutes are evicted.
 */
const EVICTION_INTERVAL_MS = 5 * 60 * 1000;
const EVICTION_THRESHOLD_MS = 10 * 60 * 1000;
let lastEviction = Date.now();

function evictStale(now: number) {
  if (now - lastEviction < EVICTION_INTERVAL_MS) return;
  lastEviction = now;
  for (const [id, bucket] of buckets) {
    if (now - bucket.lastRefill > EVICTION_THRESHOLD_MS) {
      buckets.delete(id);
    }
  }
}

function getOrCreateBucket(tokenId: number, capacity: number, now: number): Bucket {
  let bucket = buckets.get(tokenId);
  if (!bucket) {
    bucket = { tokens: capacity + BURST_ALLOWANCE, lastRefill: now, capacity };
    buckets.set(tokenId, bucket);
    return bucket;
  }
  // Update capacity if token's rate limit changed
  if (bucket.capacity !== capacity) {
    bucket.capacity = capacity;
  }
  return bucket;
}

function refill(bucket: Bucket, now: number): void {
  const elapsed = (now - bucket.lastRefill) / 1000;  // seconds
  if (elapsed <= 0) return;

  const refillRate = bucket.capacity / 60;            // tokens per second
  const added = elapsed * refillRate;
  bucket.tokens = Math.min(bucket.tokens + added, bucket.capacity + BURST_ALLOWANCE);
  bucket.lastRefill = now;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;            // Unix seconds
  retryAfterSeconds?: number; // only set when blocked
}

/**
 * Consume one token from the bucket. Returns whether the request is allowed
 * and rate-limit metadata for response headers.
 */
export function consumeToken(
  tokenId: number,
  rateLimitPerMinute: number | null,
  now: number = Date.now()
): RateLimitResult {
  evictStale(now);

  const capacity = rateLimitPerMinute ?? DEFAULT_RATE_LIMIT;
  const bucket = getOrCreateBucket(tokenId, capacity, now);
  refill(bucket, now);

  const limit = capacity;
  const resetAt = Math.ceil(now / 1000) + 60;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      limit,
      remaining: Math.floor(bucket.tokens),
      resetAt
    };
  }

  // Blocked — calculate retry-after
  const refillRate = capacity / 60;
  const retryAfterSeconds = refillRate > 0 ? Math.ceil(1 / refillRate) : 60;
  return {
    allowed: false,
    limit,
    remaining: 0,
    resetAt,
    retryAfterSeconds
  };
}

/**
 * Build rate-limit headers for a response.
 */
export function rateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAt)
  };
  if (!result.allowed && result.retryAfterSeconds) {
    headers["Retry-After"] = String(result.retryAfterSeconds);
  }
  return headers;
}

/** Reset all buckets (for testing). */
export function _resetBuckets(): void {
  buckets.clear();
}
