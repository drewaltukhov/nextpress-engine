import { describe, it, expect, beforeEach } from "vitest";
import {
  consumeToken,
  rateLimitHeaders,
  DEFAULT_RATE_LIMIT,
  BURST_ALLOWANCE,
  _resetBuckets
} from "@core-plugins/api/rate-limit";

describe("consumeToken", () => {
  const NOW = Date.now();

  beforeEach(() => {
    _resetBuckets();
  });

  it("allows requests under the limit", () => {
    const r = consumeToken(1, null, NOW);
    expect(r.allowed).toBe(true);
    expect(r.limit).toBe(DEFAULT_RATE_LIMIT);
    expect(r.remaining).toBe(DEFAULT_RATE_LIMIT + BURST_ALLOWANCE - 1);
  });

  it("uses per-token override when provided", () => {
    const r = consumeToken(2, 120, NOW);
    expect(r.limit).toBe(120);
    expect(r.remaining).toBe(120 + BURST_ALLOWANCE - 1);
  });

  it("blocks when bucket is exhausted", () => {
    // Drain the bucket
    for (let i = 0; i < DEFAULT_RATE_LIMIT + BURST_ALLOWANCE; i++) {
      consumeToken(3, null, NOW);
    }
    const r = consumeToken(3, null, NOW);
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
    expect(r.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("refills tokens over time", () => {
    // Drain the bucket
    for (let i = 0; i < DEFAULT_RATE_LIMIT + BURST_ALLOWANCE; i++) {
      consumeToken(4, null, NOW);
    }

    // Wait 30 seconds (should refill ~30 tokens at 1/sec for default 60/min)
    const later = NOW + 30_000;
    const r = consumeToken(4, null, later);
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBeGreaterThan(0);
  });

  it("caps refill at capacity + burst", () => {
    // Initial request at t=0
    consumeToken(5, 10, NOW);

    // Wait a very long time (should cap at 10 + 10 = 20)
    const later = NOW + 600_000; // 10 minutes
    const r = consumeToken(5, 10, later);
    expect(r.remaining).toBeLessThanOrEqual(10 + BURST_ALLOWANCE);
  });
});

describe("rateLimitHeaders", () => {
  it("returns standard headers on allowed request", () => {
    const headers = rateLimitHeaders({ allowed: true, limit: 60, remaining: 45, resetAt: 1714520400 });
    expect(headers["X-RateLimit-Limit"]).toBe("60");
    expect(headers["X-RateLimit-Remaining"]).toBe("45");
    expect(headers["X-RateLimit-Reset"]).toBe("1714520400");
    expect(headers["Retry-After"]).toBeUndefined();
  });

  it("includes Retry-After on blocked request", () => {
    const headers = rateLimitHeaders({ allowed: false, limit: 60, remaining: 0, resetAt: 1714520400, retryAfterSeconds: 3 });
    expect(headers["Retry-After"]).toBe("3");
  });
});
