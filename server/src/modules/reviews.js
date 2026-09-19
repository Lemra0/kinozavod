import {
  RULES,
  ageOn,
  buildMatchers,
  findHate,
  hasSpoilers,
  localDate,
  CINEMA,
  renderReview,
} from '@kinozavod/shared';
import { ApiError } from '../errors.js';

const TZ = CINEMA.timezone;

/** Loads the word-filter rows and builds matchers. Cached per call is fine. */
export function loadFilter(db) {
  const rows = db.prepare('SELECT list, pattern, match_type AS matchType FROM word_filter').all();
  return buildMatchers(rows);
}

/** Whether this viewer should have profanity masked. */
export function shouldMaskProfanity(db, viewer, now = new Date()) {
  if (!viewer) return true; // guests always masked
  // Under-18 users cannot turn the filter off.
  const age = ageOn(viewer.birth_date, localDate(now, TZ));
  if (age < RULES.adultAge) return true;
  return !viewer.show_profanity;
}

/** Has the user got a used/valid ticket for a past session of this movie? */
export function watchedAtCinema(db, userId, movieId, now = new Date()) {
  if (!userId) return false;
  const row = db
    .prepare(
      `SELECT 1 FROM tickets t
       JOIN sessions s ON s.id = t.session_id
       JOIN orders o ON o.id = t.order_id
       WHERE s.movie_id = ? AND o.user_id = ?
         AND t.status IN ('valid','used') AND s.start_time < ?
       LIMIT 1`,
    )
    .get(movieId, userId, now.toISOString());
  return Boolean(row);
}

/** Validates text for publishing: hate words block it. Returns nothing or throws. */
function assertPublishable(db, text) {
  if (!text) return;
  const filter = loadFilter(db);
  const hate = findHate(text, filter);
  if (hate.length > 0) {
    // Report the first offending span so the client can highlight it.
    throw new ApiError(400, 'REVIEW_OFFENSIVE', 'Review contains a forbidden expression', {
      span: hate[0],
    });
  }
}

export function createReview(db, { userId, movieId, rating, text }) {
  const movie = db.prepare('SELECT id FROM movies WHERE id = ? AND is_archived = 0').get(movieId);
  if (!movie) throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found');
  if (db.prepare('SELECT 1 FROM reviews WHERE user_id = ? AND movie_id = ?').get(userId, movieId)) {
    throw new ApiError(409, 'ALREADY_REVIEWED', 'You have already reviewed this film');
  }
  assertPublishable(db, text);

  const id = db
    .prepare(
      `INSERT INTO reviews (user_id, movie_id, rating, text, has_spoilers)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(userId, movieId, rating, text || null, text && hasSpoilers(text) ? 1 : 0).lastInsertRowid;
  return id;
}

export function updateReview(db, { userId, reviewId, rating, text }, now = new Date()) {
  const review = db.prepare('SELECT * FROM reviews WHERE id = ?').get(reviewId);
  if (!review) throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found');
  if (review.user_id !== userId) throw new ApiError(403, 'NOT_YOUR_REVIEW', 'Not your review');
  assertPublishable(db, text);

  db.prepare(
    `UPDATE reviews SET rating = ?, text = ?, has_spoilers = ?, updated_at = ?
     WHERE id = ?`,
  ).run(rating, text || null, text && hasSpoilers(text) ? 1 : 0, now.toISOString(), reviewId);
}

export function deleteReview(db, { userId, reviewId }) {
  const review = db.prepare('SELECT user_id FROM reviews WHERE id = ?').get(reviewId);
  if (!review) throw new ApiError(404, 'REVIEW_NOT_FOUND', 'Review not found');
  if (review.user_id !== userId) throw new ApiError(403, 'NOT_YOUR_REVIEW', 'Not your review');
  db.prepare('DELETE FROM reviews WHERE id = ?').run(reviewId);
}

/** Aggregate rating for a movie (visible reviews only). */
export function ratingSummary(db, movieId) {
  const row = db
    .prepare(
      'SELECT COUNT(*) AS count, AVG(rating) AS avg FROM reviews WHERE movie_id = ? AND is_hidden = 0',
    )
    .get(movieId);
  return { count: row.count, average: row.count ? Math.round(row.avg * 10) / 10 : null };
}

/**
 * Public reviews for a movie, rendered for the viewer.
 * Text is returned as segments (never the raw string) so masked content
 * never reaches a filtered viewer's browser.
 */
export function listReviews(db, movieId, { viewer, now = new Date() } = {}) {
  const filter = loadFilter(db);
  const mask = shouldMaskProfanity(db, viewer, now);

  const rows = db
    .prepare(
      `SELECT r.id, r.rating, r.text, r.has_spoilers AS hasSpoilers, r.created_at AS createdAt,
              r.updated_at AS updatedAt, r.user_id AS userId,
              u.nickname, u.id AS authorId
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.movie_id = ? AND r.is_hidden = 0
       ORDER BY r.created_at DESC`,
    )
    .all(movieId);

  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    author: { nickname: r.nickname, id: r.authorId },
    avatarUrl: `/api/users/${r.authorId}/avatar`,
    watched: watchedAtCinema(db, r.userId, movieId, now),
    hasSpoilers: Boolean(r.hasSpoilers),
    createdAt: r.createdAt,
    edited: r.updatedAt !== r.createdAt,
    mine: viewer ? r.userId === viewer.id : false,
    segments: r.text ? renderReview(r.text, filter, { maskProfanity: mask }) : [],
  }));
}

/** The viewer's own review of a movie, with raw text for editing. */
export function myReview(db, userId, movieId) {
  const r = db
    .prepare('SELECT id, rating, text FROM reviews WHERE user_id = ? AND movie_id = ?')
    .get(userId, movieId);
  return r ?? null;
}

/** All of a user's reviews (for the account page), with movie titles. */
export function userReviews(db, userId, lang) {
  const filter = loadFilter(db);
  const rows = db
    .prepare(
      `SELECT r.id, r.rating, r.text, r.movie_id AS movieId, r.created_at AS createdAt,
              COALESCE(mt.title, m.original_title) AS movieTitle, m.poster_path AS posterPath
       FROM reviews r
       JOIN movies m ON m.id = r.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE r.user_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(lang, userId);
  return rows.map((r) => ({
    id: r.id,
    rating: r.rating,
    movieId: r.movieId,
    movieTitle: r.movieTitle,
    createdAt: r.createdAt,
    text: r.text,
    segments: r.text ? renderReview(r.text, filter, { maskProfanity: false }) : [],
  }));
}
