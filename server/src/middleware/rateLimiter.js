const DEFAULT_LIMIT = 100;
const DEFAULT_WINDOW_MS = 60000;

function rateLimiter(options = {}) {
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? options.limit : DEFAULT_LIMIT;
  const windowMs =
    Number.isFinite(options.windowMs) && options.windowMs > 0 ? options.windowMs : DEFAULT_WINDOW_MS;

  const hits = new Map();

  return function rateLimitMiddleware(req, res, next) {
    const key =
      req.ip ||
      req.connection?.remoteAddress ||
      req.socket?.remoteAddress ||
      `${req.headers['x-forwarded-for'] || 'anonymous'}`;

    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || entry.resetAt <= now) {
      hits.set(key, {
        count: 1,
        resetAt: now + windowMs,
      });
      return next();
    }

    entry.count += 1;

    if (entry.count > limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      return res.status(429).json({
        code: 'RATE_LIMITED',
        message: `Rate limit of ${limit} requests per ${windowMs / 1000}s exceeded.`,
      });
    }

    // Periodically clean expired entries to avoid unbounded memory growth.
    if (hits.size > limit * 4) {
      for (const [storedKey, value] of hits.entries()) {
        if (value.resetAt <= now) {
          hits.delete(storedKey);
        }
      }
    }

    return next();
  };
}

module.exports = rateLimiter;
