import { FALLBACK_LOCALE, LOCALES, normalizeText } from '@kinozavod/shared';
import { GENRES } from '../data/genres.js';

const TMDB_IMAGE = 'https://image.tmdb.org/t/p';

export function seedGenres(db) {
  const findGenre = db.prepare('SELECT id FROM genres WHERE tmdb_id = ?');
  const insertGenre = db.prepare('INSERT INTO genres (tmdb_id) VALUES (?)');
  const upsertName = db.prepare(
    `INSERT INTO genre_translations (genre_id, locale, name) VALUES (?, ?, ?)
     ON CONFLICT (genre_id, locale) DO UPDATE SET name = excluded.name`,
  );

  db.transaction(() => {
    for (const genre of GENRES) {
      const id = findGenre.get(genre.tmdbId)?.id ?? insertGenre.run(genre.tmdbId).lastInsertRowid;
      for (const locale of LOCALES) upsertName.run(id, locale, genre[locale]);
    }
  })();
}

/**
 * Inserts a movie record (see tmdb.js / demo.js for the shape).
 * Returns the new movie id.
 */
export function insertMovie(db, movie) {
  const movieId = db
    .prepare(
      `INSERT INTO movies (
         source, tmdb_id, original_title, original_language, duration_min, age_rating_ee,
         release_date, rental_start, rental_end, poster_path, backdrop_path, trailer_key,
         country, year, director, cast_json, supports_3d, popularity, fetched_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      movie.source,
      movie.tmdbId ?? null,
      movie.originalTitle,
      movie.originalLanguage ?? 'en',
      movie.durationMin,
      movie.ageRating ?? null,
      movie.releaseDate ?? null,
      movie.rentalStart ?? null,
      movie.rentalEnd ?? null,
      movie.posterPath ?? null,
      movie.backdropPath ?? null,
      movie.trailerKey ?? null,
      movie.country ?? null,
      movie.year ?? null,
      movie.director ?? null,
      JSON.stringify(movie.cast ?? []),
      movie.supports3d ? 1 : 0,
      movie.popularity ?? 0,
      movie.fetchedAt ?? null,
    ).lastInsertRowid;

  const insertTranslation = db.prepare(
    'INSERT INTO movie_translations (movie_id, locale, title, overview) VALUES (?, ?, ?, ?)',
  );
  for (const locale of LOCALES) {
    const t = movie.translations?.[locale];
    if (t?.title) insertTranslation.run(movieId, locale, t.title, t.overview || null);
  }

  const linkGenre = db.prepare(
    `INSERT OR IGNORE INTO movie_genres (movie_id, genre_id)
     SELECT ?, id FROM genres WHERE tmdb_id = ?`,
  );
  for (const tmdbGenreId of movie.genres ?? []) linkGenre.run(movieId, tmdbGenreId);

  return movieId;
}

/** Rebuilds the full-text index from titles, director and cast. */
export function rebuildSearchIndex(db) {
  const movies = db.prepare('SELECT id, original_title, director, cast_json FROM movies').all();
  const titles = db.prepare('SELECT title FROM movie_translations WHERE movie_id = ?').pluck();
  const insert = db.prepare('INSERT INTO movies_search (content, movie_id) VALUES (?, ?)');

  db.transaction(() => {
    db.prepare('DELETE FROM movies_search').run();
    for (const m of movies) {
      const parts = [m.original_title, ...titles.all(m.id), m.director, ...JSON.parse(m.cast_json)];
      insert.run(normalizeText(parts.filter(Boolean).join(' ')), m.id);
    }
  })();
}

export function posterUrl(posterPath, size = 'w342') {
  if (!posterPath) return null;
  if (posterPath.startsWith('demo:')) return `/api/posters/demo/${posterPath.slice(5)}.svg`;
  return `${TMDB_IMAGE}/${size}${posterPath}`;
}

function backdropUrl(path) {
  if (!path || path.startsWith('demo:')) return null;
  return `${TMDB_IMAGE}/w1280${path}`;
}

function pickTranslation(rows, lang) {
  return (
    rows.find((r) => r.locale === lang) ??
    rows.find((r) => r.locale === FALLBACK_LOCALE) ??
    rows[0] ??
    null
  );
}

/** Loads movies by id and turns them into API objects for the given language. */
export function loadMovies(db, ids, lang) {
  if (ids.length === 0) return new Map();
  const placeholders = ids.map(() => '?').join(',');

  const movies = db.prepare(`SELECT * FROM movies WHERE id IN (${placeholders})`).all(...ids);
  const translations = db
    .prepare(
      `SELECT movie_id, locale, title, overview FROM movie_translations
       WHERE movie_id IN (${placeholders})`,
    )
    .all(...ids);
  const genres = db
    .prepare(
      `SELECT mg.movie_id, g.id, gt.name
       FROM movie_genres mg
       JOIN genres g ON g.id = mg.genre_id
       JOIN genre_translations gt ON gt.genre_id = g.id AND gt.locale = ?
       WHERE mg.movie_id IN (${placeholders})
       ORDER BY gt.name`,
    )
    .all(lang, ...ids);

  const ratings = db
    .prepare(
      `SELECT movie_id, COUNT(*) AS count, AVG(rating) AS avg
       FROM reviews WHERE movie_id IN (${placeholders}) AND is_hidden = 0
       GROUP BY movie_id`,
    )
    .all(...ids);
  const ratingByMovie = new Map(
    ratings.map((r) => [r.movie_id, { count: r.count, average: Math.round(r.avg * 10) / 10 }]),
  );

  const result = new Map();
  for (const m of movies) {
    const rows = translations.filter((t) => t.movie_id === m.id);
    const title = pickTranslation(rows, lang);
    const withOverview = rows.filter((r) => r.overview);
    const overview = pickTranslation(withOverview, lang);

    result.set(m.id, {
      id: m.id,
      source: m.source,
      title: title?.title ?? m.original_title,
      originalTitle: m.original_title,
      overview: overview?.overview ?? null,
      overviewLocale: overview?.locale ?? null,
      durationMin: m.duration_min,
      ageRating: m.age_rating_ee,
      releaseDate: m.release_date,
      rentalStart: m.rental_start,
      rentalEnd: m.rental_end,
      posterUrl: posterUrl(m.poster_path),
      backdropUrl: backdropUrl(m.backdrop_path),
      trailerKey: m.trailer_key,
      country: m.country,
      year: m.year,
      director: m.director,
      cast: JSON.parse(m.cast_json),
      originalLanguage: m.original_language,
      supports3d: Boolean(m.supports_3d),
      genres: genres.filter((g) => g.movie_id === m.id).map((g) => ({ id: g.id, name: g.name })),
      rating: ratingByMovie.get(m.id) ?? { count: 0, average: null },
    });
  }
  return result;
}

export function getMovie(db, id, lang) {
  const row = db.prepare('SELECT id FROM movies WHERE id = ? AND is_archived = 0').get(id);
  return row ? loadMovies(db, [row.id], lang).get(row.id) : null;
}

/**
 * Movies "now" (rental started) or "soon" (starts later) relative to `today`.
 */
export function listMovies(db, { status, today, lang }) {
  const ids =
    status === 'soon'
      ? db
          .prepare(
            `SELECT id FROM movies
             WHERE is_archived = 0 AND rental_start > ?
             ORDER BY rental_start, popularity DESC`,
          )
          .pluck()
          .all(today)
      : db
          .prepare(
            `SELECT id FROM movies
             WHERE is_archived = 0 AND rental_start <= ?
               AND (rental_end IS NULL OR rental_end >= ?)
             ORDER BY popularity DESC`,
          )
          .pluck()
          .all(today, today);

  const map = loadMovies(db, ids, lang);
  return ids.map((id) => map.get(id));
}
