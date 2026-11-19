/**
 * Rate limiter de janela fixa em memória.
 *
 * Adequado para desenvolvimento e instância única. Em produção com várias instâncias
 * ou serverless, substitua por armazenamento compartilhado (Redis/Upstash, KV ou banco)
 * mantendo a mesma interface. Ver docs/security/procedimentos.md.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
}

export function createRateLimiter(options: {
  limit: number;
  windowMs: number;
  now?: () => number;
  maxKeys?: number;
}): RateLimiter {
  const { limit, windowMs, now = Date.now, maxKeys = 10_000 } = options;
  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    check(key) {
      const t = now();
      let bucket = buckets.get(key);
      if (!bucket || bucket.resetAt <= t) {
        if (buckets.size >= maxKeys) {
          // Evita crescimento ilimitado de memória: descarta janelas expiradas
          for (const [k, b] of buckets) if (b.resetAt <= t) buckets.delete(k);
          if (buckets.size >= maxKeys) {
            const oldest = buckets.keys().next().value;
            if (oldest !== undefined) buckets.delete(oldest);
          }
        }
        bucket = { count: 0, resetAt: t + windowMs };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      const allowed = bucket.count <= limit;
      return {
        allowed,
        remaining: Math.max(0, limit - bucket.count),
        retryAfterSeconds: allowed ? 0 : Math.ceil((bucket.resetAt - t) / 1000),
      };
    },
  };
}
