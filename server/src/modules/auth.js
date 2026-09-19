import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { RULES, ageOn, localDate, CINEMA } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { hashToken } from './tokens.js';

const SESSION_TTL_DAYS = 30;
const NICKNAME_RE = /^[\p{L}\p{N}_-]{3,20}$/u;

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, hash) {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

/** Validates a nickname's shape and runs the word filter (offensive → reject). */
export function assertNicknameAllowed(db, nickname, { checkNickname }) {
  if (!NICKNAME_RE.test(nickname)) {
    throw new ApiError(400, 'INVALID_NICKNAME', 'Nickname must be 3–20 letters, digits, _ or -');
  }
  const verdict = checkNickname(nickname);
  if (!verdict.allowed) {
    throw new ApiError(400, 'NICKNAME_NOT_ALLOWED', 'This nickname is not allowed');
  }
}

/**
 * Registers a user. Throws on duplicate email/nickname or if under the minimum age.
 * Attaches any guest orders made with the same email.
 */
export async function registerUser(db, data, { checkNickname }, now = new Date()) {
  const today = localDate(now, CINEMA.timezone);
  if (ageOn(data.birthDate, today) < RULES.minRegistrationAge) {
    throw new ApiError(403, 'TOO_YOUNG', `Registration is from ${RULES.minRegistrationAge}`);
  }
  assertNicknameAllowed(db, data.nickname, { checkNickname });

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(data.email)) {
    throw new ApiError(409, 'EMAIL_TAKEN', 'This email is already registered');
  }
  if (db.prepare('SELECT 1 FROM users WHERE nickname = ?').get(data.nickname)) {
    throw new ApiError(409, 'NICKNAME_TAKEN', 'This nickname is already taken');
  }

  const passwordHash = await hashPassword(data.password);
  const create = db.transaction(() => {
    const userId = db
      .prepare(
        `INSERT INTO users (email, password_hash, nickname, first_name, last_name, birth_date, locale)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.email,
        passwordHash,
        data.nickname,
        data.firstName,
        data.lastName,
        data.birthDate,
        data.locale ?? 'en',
      ).lastInsertRowid;

    // Attach guest orders with the same email (spec 6.6).
    db.prepare('UPDATE orders SET user_id = ? WHERE user_id IS NULL AND email = ?').run(
      userId,
      data.email,
    );
    return userId;
  });

  return create();
}

export async function login(db, { email, password }) {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  const ok = user && (await verifyPassword(password, user.password_hash));
  if (!ok) throw new ApiError(401, 'INVALID_CREDENTIALS', 'Wrong email or password');
  if (user.is_blocked) throw new ApiError(403, 'ACCOUNT_BLOCKED', 'This account is blocked');
  return user;
}

/** Creates a session row and returns the raw token to put in the cookie. */
export function createSession(db, userId, now = new Date()) {
  const token = crypto.randomBytes(24).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_DAYS * 86400 * 1000).toISOString();
  db.prepare('INSERT INTO sessions_auth (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    hashToken(token),
    userId,
    expiresAt,
  );
  return { token, expiresAt };
}

export function destroySession(db, token) {
  if (!token) return;
  db.prepare('DELETE FROM sessions_auth WHERE token_hash = ?').run(hashToken(token));
}

/** Resolves a session token to a user, or null. Cleans up if expired. */
export function userFromSession(db, token, now = new Date()) {
  if (!token) return null;
  const row = db
    .prepare(
      'SELECT user_id AS userId, expires_at AS expiresAt FROM sessions_auth WHERE token_hash = ?',
    )
    .get(hashToken(token));
  if (!row) return null;
  if (new Date(row.expiresAt) <= now) {
    db.prepare('DELETE FROM sessions_auth WHERE token_hash = ?').run(hashToken(token));
    return null;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.userId);
  if (!user || user.is_blocked) return null;
  return user;
}

export const NICKNAME_PATTERN = NICKNAME_RE;
