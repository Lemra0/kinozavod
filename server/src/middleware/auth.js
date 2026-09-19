import { ApiError } from '../errors.js';
import { userFromSession } from '../modules/auth.js';

export const SESSION_COOKIE = 'kz_session';
export const CSRF_COOKIE = 'kz_csrf';
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Parses a Cookie header into a plain object. */
function parseCookies(header) {
  const out = {};
  for (const part of (header ?? '').split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    if (key) out[key] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** Reads the session cookie and attaches req.user (or null). */
export function attachUser(db) {
  return (req, _res, next) => {
    const cookies = parseCookies(req.headers.cookie);
    req.sessionToken = cookies[SESSION_COOKIE] ?? null;
    req.cookies = cookies;
    req.user = userFromSession(db, req.sessionToken);
    next();
  };
}

/**
 * CSRF protection with the double-submit cookie pattern:
 * unsafe requests must echo the CSRF cookie in the X-CSRF-Token header.
 * Only enforced when a session cookie is present (guest calls are unaffected).
 */
export function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method) || !req.sessionToken) return next();
  const cookieToken = req.cookies?.[CSRF_COOKIE];
  const headerToken = req.get('X-CSRF-Token');
  if (!cookieToken || cookieToken !== headerToken) {
    return next(new ApiError(403, 'CSRF', 'CSRF check failed'));
  }
  next();
}

export function requireAuth(req, _res, next) {
  if (!req.user) return next(new ApiError(401, 'AUTH_REQUIRED', 'Please sign in'));
  next();
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'AUTH_REQUIRED', 'Please sign in'));
    if (!roles.includes(req.user.role)) return next(new ApiError(403, 'FORBIDDEN', 'Not allowed'));
    next();
  };
}
