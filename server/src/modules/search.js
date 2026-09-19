import { normalizeText } from '@kinozavod/shared';

/** Builds an FTS5 query where every word is a prefix match. */
export function buildFtsQuery(text) {
  const words = normalizeText(text).split(' ').filter(Boolean).slice(0, 8);
  if (words.length === 0) return null;
  return words.map((w) => `"${w}"*`).join(' ');
}

/** Movie ids matching the text, best matches first. */
export function searchMovieIds(db, text, limit = 50) {
  const query = buildFtsQuery(text);
  if (!query) return [];
  return db
    .prepare(
      `SELECT ms.movie_id FROM movies_search ms
       JOIN movies m ON m.id = ms.movie_id AND m.is_archived = 0
       WHERE movies_search MATCH ?
       ORDER BY rank, m.popularity DESC
       LIMIT ?`,
    )
    .pluck()
    .all(query, limit);
}
