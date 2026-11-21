/**
 * Fixed-window in-memory rate limiter. Per process: fine for one Railway instance and the hackathon;
 * move to Redis / @fastify/rate-limit when we scale out.
 */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  private readonly windowMs: number;
  constructor(windowMs: number) {
    this.windowMs = windowMs;
  }

  /** Counts a hit; returns false if the key is over `limit` in the current window. */
  take(key: string, limit: number, now = Date.now()): boolean {
    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 10_000) this.prune(now);
      return true;
    }
    entry.count++;
    return entry.count <= limit;
  }

  private prune(now: number) {
    for (const [key, entry] of this.hits) if (entry.resetAt <= now) this.hits.delete(key);
  }
}
