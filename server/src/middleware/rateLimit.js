import { ApiError } from '../errors.js';

/**
 * Very small in-memory rate limiter for auth endpoints.
 * Keyed by IP + route. Enough for a portfolio; a real app would use a store.
 */
export function rateLimit({ windowMs = 15 * 60 * 1000, max = 10 } = {}) {
  const hits = new Map();

  return (req, _res, next) => {
    const key = `${req.ip}:${req.baseUrl}${req.path}`;
    const now = Date.now();
    const entry = hits.get(key);
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      return next(new ApiError(429, 'RATE_LIMITED', 'Too many attempts, try again later'));
    }
    next();
  };
}
