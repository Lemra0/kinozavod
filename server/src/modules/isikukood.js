// Demo verification of an Estonian personal code (isikukood).
// This only parses and checks the number; it is NOT a real identity check.
// The code itself is never stored — we return the birth date only.

const CENTURY = { 1: 1800, 2: 1800, 3: 1900, 4: 1900, 5: 2000, 6: 2000 };
const WEIGHTS_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 1];
const WEIGHTS_2 = [3, 4, 5, 6, 7, 8, 9, 1, 2, 3];

function checkDigit(digits) {
  const sum = (weights) => weights.reduce((acc, w, i) => acc + w * digits[i], 0);
  let remainder = sum(WEIGHTS_1) % 11;
  if (remainder === 10) remainder = sum(WEIGHTS_2) % 11;
  return remainder === 10 ? 0 : remainder;
}

function isValidDate(year, month, day) {
  if (month < 1 || month > 12 || day < 1 || day > 31) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/**
 * Parses an isikukood and returns { valid, birthDate } (birthDate as 'YYYY-MM-DD').
 * Never returns or logs the code itself.
 */
export function parseIsikukood(raw) {
  const code = String(raw ?? '').trim();
  if (!/^\d{11}$/.test(code)) return { valid: false };

  const digits = code.split('').map(Number);
  const centuryBase = CENTURY[digits[0]];
  if (!centuryBase) return { valid: false };

  const year = centuryBase + digits[1] * 10 + digits[2];
  const month = digits[3] * 10 + digits[4];
  const day = digits[5] * 10 + digits[6];
  if (!isValidDate(year, month, day)) return { valid: false };
  if (checkDigit(digits) !== digits[10]) return { valid: false };

  const pad = (n) => String(n).padStart(2, '0');
  return { valid: true, birthDate: `${year}-${pad(month)}-${pad(day)}` };
}

/** Builds a valid demo code for a given birth date (for the README generator/tests). */
export function buildDemoIsikukood(birthDate, serial = 500) {
  const [year, month, day] = birthDate.split('-').map(Number);
  const centuryDigit = year >= 2000 ? 5 : year >= 1900 ? 3 : 1; // gender ignored; use odd (male) by convention
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  const body = `${centuryDigit}${pad(year % 100)}${pad(month)}${pad(day)}${pad(serial, 3)}`;
  const digits = body.split('').map(Number);
  return body + checkDigit(digits);
}
