import { AGE_RATINGS, CINEMA, localDate } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { insertMovie, loadMovies, posterUrl, rebuildSearchIndex } from './movies.js';
import { createTmdbClient, mapTmdbMovie } from './tmdb.js';

const TZ = CINEMA.timezone;

/** Admin movie list (includes archived), with rental window and session count. */
export function adminListMovies(db, { lang = 'en', includeArchived = true } = {}) {
  const rows = db
    .prepare(
      `SELECT m.id, m.source, m.tmdb_id AS tmdbId, m.original_title AS originalTitle,
              m.age_rating_ee AS ageRating, m.rental_start AS rentalStart, m.rental_end AS rentalEnd,
              m.is_archived AS isArchived, m.poster_path AS posterPath, m.fetched_at AS fetchedAt,
              COALESCE(mt.title, m.original_title) AS title,
              (SELECT COUNT(*) FROM sessions s WHERE s.movie_id = m.id AND s.status = 'scheduled'
                 AND s.start_time > ?) AS upcomingSessions,
              (SELECT COUNT(*) FROM tickets t JOIN sessions s ON s.id = t.session_id
                 WHERE s.movie_id = m.id AND t.status IN ('valid','used')) AS soldTickets
       FROM movies m
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       ${includeArchived ? '' : 'WHERE m.is_archived = 0'}
       ORDER BY m.is_archived, m.rental_start DESC`,
    )
    .all(new Date().toISOString(), lang);
  return rows.map((m) => ({
    ...m,
    isArchived: Boolean(m.isArchived),
    posterUrl: posterUrl(m.posterPath),
  }));
}

const AGE_KEYS = Object.keys(AGE_RATINGS);

/** Updates editable movie fields: age rating and rental window. */
export function updateMovie(db, id, patch) {
  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(id);
  if (!movie) throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found');

  const fields = [];
  const values = [];
  if (patch.ageRating !== undefined) {
    if (patch.ageRating !== null && !AGE_KEYS.includes(patch.ageRating)) {
      throw new ApiError(400, 'BAD_RATING', 'Unknown age rating');
    }
    fields.push('age_rating_ee = ?');
    values.push(patch.ageRating);
  }
  if (patch.rentalStart !== undefined) {
    fields.push('rental_start = ?');
    values.push(patch.rentalStart);
  }
  if (patch.rentalEnd !== undefined) {
    fields.push('rental_end = ?');
    values.push(patch.rentalEnd);
  }
  if (fields.length)
    db.prepare(`UPDATE movies SET ${fields.join(', ')} WHERE id = ?`).run(...values, id);
  return adminListMovies(db).find((m) => m.id === id);
}

/** Archives or restores a movie. Archiving is blocked only if it has sold tickets AND you try to delete; archive is always allowed. */
export function setArchived(db, id, archived) {
  const movie = db.prepare('SELECT id FROM movies WHERE id = ?').get(id);
  if (!movie) throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found');
  db.prepare('UPDATE movies SET is_archived = ? WHERE id = ?').run(archived ? 1 : 0, id);
}

/** Searches TMDB for movies to import (admin). Returns lightweight results. */
export async function tmdbSearch(db, config, query, { fetchImpl } = {}) {
  if (!config.tmdbApiKey) throw new ApiError(400, 'NO_TMDB_KEY', 'TMDB key is not configured');
  const client = createTmdbClient({ apiKey: config.tmdbApiKey, fetchImpl });
  const data = await client.search(query);
  const existing = new Set(
    db.prepare('SELECT tmdb_id FROM movies WHERE tmdb_id IS NOT NULL').pluck().all(),
  );
  return (data.results ?? []).slice(0, 12).map((m) => ({
    tmdbId: m.id,
    title: m.title,
    originalTitle: m.original_title,
    year: m.release_date ? Number(m.release_date.slice(0, 4)) : null,
    posterUrl: m.poster_path ? `https://image.tmdb.org/t/p/w185${m.poster_path}` : null,
    alreadyImported: existing.has(m.id),
  }));
}

/** Imports one movie from TMDB by id, or refreshes it if it already exists. */
export async function tmdbImport(db, config, tmdbId, { fetchImpl, now = new Date() } = {}) {
  if (!config.tmdbApiKey) throw new ApiError(400, 'NO_TMDB_KEY', 'TMDB key is not configured');
  const client = createTmdbClient({ apiKey: config.tmdbApiKey, fetchImpl });
  const details = await client.details(tmdbId);
  const today = localDate(now, TZ);
  const record = mapTmdbMovie(details, { today });

  const existing = db.prepare('SELECT id FROM movies WHERE tmdb_id = ?').get(tmdbId);
  if (existing) {
    // Refresh translations/metadata but keep the admin's rental window & rating.
    refreshMovieFrom(db, existing.id, record);
    rebuildSearchIndex(db);
    return { id: existing.id, refreshed: true };
  }
  const id = insertMovie(db, record);
  rebuildSearchIndex(db);
  return { id, refreshed: false };
}

/** Refreshes an existing movie's TMDB-sourced fields, preserving admin edits. */
function refreshMovieFrom(db, movieId, record) {
  db.transaction(() => {
    db.prepare(
      `UPDATE movies SET original_title = ?, duration_min = ?, poster_path = ?, backdrop_path = ?,
              trailer_key = ?, country = ?, year = ?, director = ?, cast_json = ?, popularity = ?,
              fetched_at = ?
       WHERE id = ?`,
    ).run(
      record.originalTitle,
      record.durationMin,
      record.posterPath,
      record.backdropPath,
      record.trailerKey,
      record.country,
      record.year,
      record.director,
      JSON.stringify(record.cast ?? []),
      record.popularity ?? 0,
      record.fetchedAt,
      movieId,
    );
    // Only set the EE rating if the movie has none yet (don't overwrite admin's choice).
    const current = db
      .prepare('SELECT age_rating_ee FROM movies WHERE id = ?')
      .pluck()
      .get(movieId);
    if (!current && record.ageRating) {
      db.prepare('UPDATE movies SET age_rating_ee = ? WHERE id = ?').run(record.ageRating, movieId);
    }
    const upsert = db.prepare(
      `INSERT INTO movie_translations (movie_id, locale, title, overview) VALUES (?, ?, ?, ?)
       ON CONFLICT (movie_id, locale) DO UPDATE SET title = excluded.title, overview = excluded.overview`,
    );
    for (const locale of ['en', 'ru', 'et']) {
      const tr = record.translations?.[locale];
      if (tr?.title) upsert.run(movieId, locale, tr.title, tr.overview ?? null);
    }
  })();
}

export async function refreshMovie(db, config, movieId, { fetchImpl, now = new Date() } = {}) {
  const movie = db.prepare('SELECT tmdb_id AS tmdbId FROM movies WHERE id = ?').get(movieId);
  if (!movie) throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found');
  if (!movie.tmdbId) throw new ApiError(400, 'NOT_TMDB', 'This is not a TMDB movie');
  return tmdbImport(db, config, movie.tmdbId, { fetchImpl, now });
}

export { loadMovies };
