import {
  CINEMA,
  RULES,
  addDays,
  localDate,
  localTime,
  weekdayOf,
  zonedTimeToDate,
} from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { findOverlap } from './schedule.js';
import { emitSeatChanges } from './events.js';

const TZ = CINEMA.timezone;

function loadMovieAndHall(db, movieId, hallId) {
  const movie = db
    .prepare(
      'SELECT id, duration_min AS duration, supports_3d AS supports3d, original_language AS lang FROM movies WHERE id = ? AND is_archived = 0',
    )
    .get(movieId);
  if (!movie) throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found or archived');
  const hall = db.prepare('SELECT id, formats FROM halls WHERE id = ?').get(hallId);
  if (!hall) throw new ApiError(404, 'HALL_NOT_FOUND', 'Hall not found');
  return { movie, hall };
}

/** Creates one session, checking format support, opening hours and overlaps. */
export function createSession(db, { movieId, hallId, date, time, format }) {
  const { movie, hall } = loadMovieAndHall(db, movieId, hallId);
  if (!hall.formats.split(',').includes(format)) {
    throw new ApiError(400, 'FORMAT_UNSUPPORTED', 'The hall does not support this format');
  }
  if (format === '3D' && !movie.supports3d) {
    throw new ApiError(400, 'NO_3D', 'This movie is not available in 3D');
  }
  if (time < CINEMA.opensAt || time > CINEMA.lastScreeningStartsAt) {
    throw new ApiError(400, 'OUTSIDE_HOURS', 'Session start is outside opening hours');
  }

  const start = zonedTimeToDate(date, time, TZ);
  const end = new Date(start.getTime() + movie.duration * 60 * 1000);
  const overlap = findOverlap(db, { hallId, start: start.toISOString(), end: end.toISOString() });
  if (overlap) throw new ApiError(409, 'OVERLAP', 'Overlaps another session in this hall');

  const subtitles = ['et', 'ru', 'en']
    .filter((l) => l !== movie.lang)
    .slice(0, 2)
    .join(',');
  const id = db
    .prepare(
      `INSERT INTO sessions (movie_id, hall_id, start_time, end_time, format, language, subtitles)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      movieId,
      hallId,
      start.toISOString(),
      end.toISOString(),
      format,
      movie.lang,
      subtitles,
    ).lastInsertRowid;
  return { id };
}

/**
 * Bulk-creates sessions from a weekly template repeated over N weeks.
 * `slots`: [{ weekday 1-7, time 'HH:MM' }]. Skips slots that overlap or fall
 * outside hours, and reports how many were created and skipped.
 */
export function bulkCreateSessions(db, { movieId, hallId, format, startDate, weeks, slots }) {
  const { movie, hall } = loadMovieAndHall(db, movieId, hallId);
  if (!hall.formats.split(',').includes(format)) {
    throw new ApiError(400, 'FORMAT_UNSUPPORTED', 'The hall does not support this format');
  }
  if (format === '3D' && !movie.supports3d)
    throw new ApiError(400, 'NO_3D', 'This movie is not available in 3D');

  let created = 0;
  const skipped = [];
  const subtitles = ['et', 'ru', 'en']
    .filter((l) => l !== movie.lang)
    .slice(0, 2)
    .join(',');
  const insert = db.prepare(
    `INSERT INTO sessions (movie_id, hall_id, start_time, end_time, format, language, subtitles)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );

  db.transaction(() => {
    for (let w = 0; w < weeks; w += 1) {
      for (const slot of slots) {
        // find the date of this weekday in week w, starting from startDate
        let date = addDays(startDate, w * 7);
        // advance to the requested weekday within that week
        const shift = (slot.weekday - weekdayOf(date) + 7) % 7;
        date = addDays(date, shift);
        if (slot.time < CINEMA.opensAt || slot.time > CINEMA.lastScreeningStartsAt) {
          skipped.push({ date, time: slot.time, reason: 'hours' });
          continue;
        }
        const start = zonedTimeToDate(date, slot.time, TZ);
        const end = new Date(start.getTime() + movie.duration * 60 * 1000);
        if (findOverlap(db, { hallId, start: start.toISOString(), end: end.toISOString() })) {
          skipped.push({ date, time: slot.time, reason: 'overlap' });
          continue;
        }
        insert.run(
          movieId,
          hallId,
          start.toISOString(),
          end.toISOString(),
          format,
          movie.lang,
          subtitles,
        );
        created += 1;
      }
    }
  })();

  return { created, skipped };
}

/**
 * Cancels a session: refunds every paid order and releases the seats.
 * Pending holds are released too. Returns how many orders were refunded.
 */
export function cancelSession(db, sessionId) {
  const session = db.prepare('SELECT id, status FROM sessions WHERE id = ?').get(sessionId);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
  if (session.status === 'cancelled') return { refunded: 0 };

  const paidOrders = db
    .prepare("SELECT id FROM orders WHERE session_id = ? AND status = 'paid'")
    .pluck()
    .all(sessionId);

  let refunded = 0;
  for (const orderId of paidOrders) {
    // Cancellation refunds regardless of the 1h deadline, so bypass refundOrder's
    // time check by doing it inline here.
    forceRefund(db, orderId);
    refunded += 1;
  }

  // Release any pending holds and mark the session cancelled.
  db.transaction(() => {
    db.prepare(
      "UPDATE tickets SET status = 'released' WHERE session_id = ? AND status = 'reserved'",
    ).run(sessionId);
    db.prepare(
      "UPDATE orders SET status = 'expired' WHERE session_id = ? AND status = 'pending'",
    ).run(sessionId);
    db.prepare("UPDATE sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);
  })();

  // Note: emails to buyers would be sent here in a real deployment (mailer).
  return { refunded };
}

/** Refund that ignores the time deadline — used only for cinema-initiated cancellation. */
function forceRefund(db, orderId) {
  const seatIds = db
    .prepare("SELECT seat_id FROM tickets WHERE order_id = ? AND status IN ('valid','used')")
    .pluck()
    .all(orderId);
  const sessionId = db.prepare('SELECT session_id FROM orders WHERE id = ?').pluck().get(orderId);
  db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (order_id, amount, method, status, card_last4)
       SELECT ?, amount, method, 'refunded', card_last4 FROM payments
       WHERE order_id = ? AND status = 'success' LIMIT 1`,
    ).run(orderId, orderId);
    db.prepare(
      "UPDATE tickets SET status = 'refunded' WHERE order_id = ? AND status IN ('valid','used')",
    ).run(orderId);
    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(orderId);
  })();
  if (sessionId && seatIds.length) {
    emitSeatChanges(
      sessionId,
      seatIds.map((seatId) => ({ seatId, status: 'free' })),
    );
  }
}

/** How many days ahead the schedule is filled (for the "fill" warning). */
export function scheduleCoverageDays(db, now = new Date()) {
  const last = db
    .prepare("SELECT MAX(start_time) AS last FROM sessions WHERE status = 'scheduled'")
    .pluck()
    .get();
  if (!last) return 0;
  const today = localDate(now, TZ);
  const lastDay = localDate(new Date(last), TZ);
  const ms = zonedTimeToDate(lastDay, '00:00', TZ) - zonedTimeToDate(today, '00:00', TZ);
  return Math.max(0, Math.round(ms / (24 * 3600 * 1000)));
}

/** Admin session list for a day, with sold counts. */
export function adminSessionsForDay(db, { date, lang = 'en' }) {
  const from = zonedTimeToDate(date, '00:00', TZ).toISOString();
  const to = zonedTimeToDate(addDays(date, 1), '00:00', TZ).toISOString();
  return db
    .prepare(
      `SELECT s.id, s.start_time AS startTime, s.format, s.status,
              h.code AS hallCode, h.name_key AS hallNameKey,
              COALESCE(mt.title, m.original_title) AS movieTitle,
              (SELECT COUNT(*) FROM tickets t WHERE t.session_id = s.id AND t.status IN ('valid','used')) AS sold
       FROM sessions s
       JOIN halls h ON h.id = s.hall_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE s.start_time >= ? AND s.start_time < ?
       ORDER BY s.start_time, h.code`,
    )
    .all(lang, from, to)
    .map((s) => ({ ...s, localTime: localTime(new Date(s.startTime), TZ) }));
}
