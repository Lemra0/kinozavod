import { ApiError } from '../errors.js';

const LISTS = ['profanity', 'hate', 'exception'];
const LOCALES = ['en', 'ru', 'et'];

export function listWordFilter(db) {
  return db
    .prepare(
      'SELECT id, locale, list, pattern, match_type AS matchType FROM word_filter ORDER BY locale, list, pattern',
    )
    .all();
}

export function addWordFilter(db, { locale, list, pattern, matchType = 'word' }, userId) {
  if (!LOCALES.includes(locale)) throw new ApiError(400, 'BAD_LOCALE', 'Unknown locale');
  if (!LISTS.includes(list)) throw new ApiError(400, 'BAD_LIST', 'Unknown list');
  if (!['word', 'root'].includes(matchType))
    throw new ApiError(400, 'BAD_MATCH', 'Unknown match type');
  const clean = String(pattern ?? '')
    .trim()
    .toLowerCase();
  if (!clean) throw new ApiError(400, 'EMPTY_PATTERN', 'Pattern is required');
  try {
    const id = db
      .prepare(
        'INSERT INTO word_filter (locale, list, pattern, match_type, created_by) VALUES (?, ?, ?, ?, ?)',
      )
      .run(locale, list, clean, matchType, userId).lastInsertRowid;
    return { id };
  } catch (error) {
    if (String(error.message).includes('UNIQUE'))
      throw new ApiError(409, 'DUPLICATE', 'Already in the list');
    throw error;
  }
}

export function removeWordFilter(db, id) {
  db.prepare('DELETE FROM word_filter WHERE id = ?').run(id);
}
