/** All genres with localized names, for search filters. */
export function listGenres(db, lang) {
  return db
    .prepare(
      `SELECT g.id, gt.name
       FROM genres g
       JOIN genre_translations gt ON gt.genre_id = g.id AND gt.locale = ?
       WHERE g.id IN (SELECT DISTINCT genre_id FROM movie_genres)
       ORDER BY gt.name`,
    )
    .all(lang);
}

/** Distinct original languages of movies that currently have sessions. */
export function listSessionLanguages(db) {
  return db
    .prepare(
      `SELECT DISTINCT s.language
       FROM sessions s
       WHERE s.status = 'scheduled' AND s.start_time > ?
       ORDER BY s.language`,
    )
    .pluck()
    .all(new Date().toISOString());
}
