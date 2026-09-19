import crypto from 'node:crypto';

/** Random URL-safe token and its SHA-256 hash (only the hash is stored). */
export function makeToken() {
  const token = crypto.randomBytes(24).toString('base64url');
  return { token, hash: hashToken(token) };
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Short human-friendly ticket code, e.g. KZ-7F3A-92Q1. */
export function makeTicketCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[crypto.randomInt(alphabet.length)]).join('');
  return `KZ-${group()}-${group()}`;
}
