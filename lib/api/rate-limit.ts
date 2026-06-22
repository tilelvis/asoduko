/**
 * Simple in-memory rate limiter — per-user token bucket.
 *
 * For a Sudoku miniapp this is enough. For higher traffic, swap for
 * `@upstash/ratelimit` (Redis-backed) — the API is the same.
 *
 * Limits are intentionally tight on wallet endpoints to make brute-force
 * and replay attacks uneconomic.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

interface RateLimitOptions {
  /** Maximum tokens in the bucket. */
  capacity: number;
  /** Tokens added per second. */
  refillPerSecond: number;
}

/**
 * Returns true if the request is allowed, false if rate-limited.
 * Key should be `${alienId}:${endpoint}` so different endpoints get
 * independent buckets.
 */
export function rateLimit(
  key: string,
  opts: RateLimitOptions,
): { allowed: boolean; remaining: number; resetInMs: number } {
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: opts.capacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time.
  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(
    opts.capacity,
    bucket.tokens + elapsed * opts.refillPerSecond,
  );
  bucket.lastRefill = now;

  if (bucket.tokens >= 1) {
    bucket.tokens -= 1;
    return {
      allowed: true,
      remaining: Math.floor(bucket.tokens),
      resetInMs: Math.ceil((1 / opts.refillPerSecond) * 1000),
    };
  }

  return {
    allowed: false,
    remaining: 0,
    resetInMs: Math.ceil((1 / opts.refillPerSecond) * 1000),
  };
}

/** Default limits per endpoint. */
export const RATE_LIMITS = {
  balance: { capacity: 30, refillPerSecond: 1 }, // 30 burst, 1/s steady
  transactions: { capacity: 20, refillPerSecond: 0.5 },
  deposit: { capacity: 5, refillPerSecond: 0.1 }, // 5 burst, 1 per 10s
  withdraw: { capacity: 3, refillPerSecond: 0.05 }, // 3 burst, 1 per 20s
  claim: { capacity: 10, refillPerSecond: 0.2 }, // 10 burst, 1 per 5s
} as const;
