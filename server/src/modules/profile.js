import { RULES, addDays, localDate, CINEMA } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { assertNicknameAllowed, hashPassword, verifyPassword } from './auth.js';

/** Public user view (safe to return to the owner). */
export function meView(db, user) {
  const genres = db
    .prepare('SELECT genre_id AS id FROM user_genres WHERE user_id = ?')
    .pluck()
    .all(user.id);
  return {
    id: user.id,
    email: user.email,
    nickname: user.nickname,
    firstName: user.first_name,
    lastName: user.last_name,
    birthDate: user.birth_date,
    role: user.role,
    locale: user.locale,
    emailVerified: Boolean(user.email_verified),
    showProfanity: Boolean(user.show_profanity),
    avatarUrl: `/api/users/${user.id}/avatar`,
    hasCustomAvatar: Boolean(user.avatar_path),
    genres,
    nicknameChangedAt: user.nickname_changed_at,
  };
}

export function updateProfile(db, user, patch, { checkNickname }, now = new Date()) {
  const fields = [];
  const values = [];

  if (patch.nickname !== undefined && patch.nickname !== user.nickname) {
    if (user.nickname_changed_at) {
      const allowedFrom = addDays(
        localDate(new Date(user.nickname_changed_at), CINEMA.timezone),
        RULES.nicknameChangeDays,
      );
      if (localDate(now, CINEMA.timezone) < allowedFrom) {
        throw new ApiError(409, 'NICKNAME_TOO_SOON', 'Nickname can be changed once every 30 days', {
          allowedFrom,
        });
      }
    }
    assertNicknameAllowed(db, patch.nickname, { checkNickname });
    if (
      db.prepare('SELECT 1 FROM users WHERE nickname = ? AND id <> ?').get(patch.nickname, user.id)
    ) {
      throw new ApiError(409, 'NICKNAME_TAKEN', 'This nickname is already taken');
    }
    fields.push('nickname = ?', 'nickname_changed_at = ?');
    values.push(patch.nickname, now.toISOString());
  }
  if (patch.firstName !== undefined) {
    fields.push('first_name = ?');
    values.push(patch.firstName);
  }
  if (patch.lastName !== undefined) {
    fields.push('last_name = ?');
    values.push(patch.lastName);
  }
  if (patch.locale !== undefined) {
    fields.push('locale = ?');
    values.push(patch.locale);
  }
  if (patch.showProfanity !== undefined) {
    fields.push('show_profanity = ?');
    values.push(patch.showProfanity ? 1 : 0);
  }

  if (fields.length > 0) {
    db.prepare(`UPDATE users SET ${fields.join(', ')} WHERE id = ?`).run(...values, user.id);
  }
  // birth_date is intentionally NOT editable here (admin only).
  return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
}

export async function changePassword(db, user, { currentPassword, newPassword }) {
  if (user.is_demo) throw new ApiError(403, 'DEMO_LOCKED', 'Demo accounts cannot be changed');
  if (!(await verifyPassword(currentPassword, user.password_hash))) {
    throw new ApiError(403, 'WRONG_PASSWORD', 'Current password is wrong');
  }
  const hash = await hashPassword(newPassword);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
}

export function setGenres(db, user, genreIds) {
  const valid = db.prepare('SELECT id FROM genres').pluck().all();
  const validSet = new Set(valid);
  const chosen = [...new Set(genreIds)].filter((id) => validSet.has(id));
  db.transaction(() => {
    db.prepare('DELETE FROM user_genres WHERE user_id = ?').run(user.id);
    const insert = db.prepare('INSERT INTO user_genres (user_id, genre_id) VALUES (?, ?)');
    for (const id of chosen) insert.run(user.id, id);
  })();
  return chosen;
}

export function deleteAccount(db, user) {
  if (user.is_demo) throw new ApiError(403, 'DEMO_LOCKED', 'Demo accounts cannot be deleted');
  // Keep orders for accounting but detach the person; personal rows cascade.
  db.transaction(() => {
    db.prepare('UPDATE orders SET user_id = NULL WHERE user_id = ?').run(user.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
  })();
}

// --- watchlist ---
export function getWatchlist(db, user) {
  const ids = db
    .prepare('SELECT movie_id FROM watchlist WHERE user_id = ? ORDER BY created_at DESC')
    .pluck()
    .all(user.id);
  return ids;
}

export function addToWatchlist(db, user, movieId) {
  if (!db.prepare('SELECT 1 FROM movies WHERE id = ? AND is_archived = 0').get(movieId)) {
    throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found');
  }
  db.prepare('INSERT OR IGNORE INTO watchlist (user_id, movie_id) VALUES (?, ?)').run(
    user.id,
    movieId,
  );
}

export function removeFromWatchlist(db, user, movieId) {
  db.prepare('DELETE FROM watchlist WHERE user_id = ? AND movie_id = ?').run(user.id, movieId);
}

/** Orders belonging to the user, newest first. */
export function userOrders(db, user, lang) {
  const rows = db
    .prepare(
      `SELECT o.id, o.status, o.total, o.created_at AS createdAt, o.access_token_hash AS hasToken,
              s.start_time AS startTime, s.format,
              h.name_key AS hallNameKey,
              COALESCE(mt.title, m.original_title) AS movieTitle, m.id AS movieId,
              (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id
                 AND t.status IN ('reserved','valid','used','refunded')) AS ticketCount
       FROM orders o
       JOIN sessions s ON s.id = o.session_id
       JOIN halls h ON h.id = s.hall_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE o.user_id = ?
       ORDER BY o.created_at DESC`,
    )
    .all(lang, user.id);
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    total: r.total,
    createdAt: r.createdAt,
    startTime: r.startTime,
    format: r.format,
    hallNameKey: r.hallNameKey,
    movieTitle: r.movieTitle,
    movieId: r.movieId,
    ticketCount: r.ticketCount,
  }));
}
