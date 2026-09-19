/**
 * Normalizes text for search: lower case, "ё" → "е", no diacritics
 * (õ → o, ä → a), punctuation turned into single spaces.
 */
export function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}
