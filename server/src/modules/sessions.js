import { CINEMA, RULES, localDate, localTime, seatPrice } from '@kinozavod/shared';
import { getPriceSettings } from '../settings.js';

const TZ = CINEMA.timezone;

/** Cheapest seat type per hall (used for "price from"). */
function cheapestSeatTypes(db) {
  const rows = db.prepare('SELECT DISTINCT hall_id, type FROM seats WHERE is_active = 1').all();
  const order = ['standard', 'vip', 'sofa'];
  const result = new Map();
  for (const row of rows) {
    const current = result.get(row.hall_id);
    if (!current || order.indexOf(row.type) < order.indexOf(current)) {
      result.set(row.hall_id, row.type);
    }
  }
  return result;
}

/**
 * Sessions in [from, to) with hall info, seat availability and status flags.
 * Filters: movieId, hallCode, format.
 */
export function findSessions(db, { from, to, movieId, hallCode, format, now = new Date() }) {
  const rows = db
    .prepare(
      `SELECT s.id, s.movie_id AS movieId, s.hall_id AS hallId, s.start_time AS startTime,
              s.end_time AS endTime, s.format, s.language, s.subtitles,
              h.code AS hallCode, h.name_key AS hallNameKey, h.has_zavod_sound AS zavodSound,
              (SELECT COUNT(*) FROM seats WHERE hall_id = s.hall_id AND is_active = 1) AS seatsTotal,
              (SELECT COUNT(*) FROM tickets t
                 WHERE t.session_id = s.id AND t.status IN ('reserved', 'valid', 'used')) AS seatsTaken
       FROM sessions s
       JOIN halls h ON h.id = s.hall_id
       WHERE s.status = 'scheduled'
         AND s.start_time >= ? AND s.start_time < ?
         AND (? IS NULL OR s.movie_id = ?)
         AND (? IS NULL OR h.code = ?)
         AND (? IS NULL OR s.format = ?)
       ORDER BY s.start_time, h.code`,
    )
    .all(
      from,
      to,
      movieId ?? null,
      movieId ?? null,
      hallCode ?? null,
      hallCode ?? null,
      format ?? null,
      format ?? null,
    );

  const prices = getPriceSettings(db);
  const cheapest = cheapestSeatTypes(db);
  const nowMs = now.getTime();
  const closeMs = RULES.onlineSalesCloseMinutes * 60 * 1000;

  return rows.map((s) => {
    const start = new Date(s.startTime);
    const seatsFree = s.seatsTotal - s.seatsTaken;
    const time = localTime(start, TZ);
    return {
      id: s.id,
      movieId: s.movieId,
      startTime: s.startTime,
      endTime: s.endTime,
      localDate: localDate(start, TZ),
      localTime: time,
      format: s.format,
      language: s.language,
      subtitles: s.subtitles ? s.subtitles.split(',') : [],
      hall: { code: s.hallCode, nameKey: s.hallNameKey, zavodSound: Boolean(s.zavodSound) },
      priceFrom: seatPrice({
        seatType: cheapest.get(s.hallId) ?? 'standard',
        format: s.format,
        localStartTime: time,
        prices,
      }),
      seatsTotal: s.seatsTotal,
      seatsFree,
      past: start.getTime() <= nowMs,
      salesClosed: start.getTime() - closeMs <= nowMs,
      soldOut: seatsFree <= 0,
      lowSeats: seatsFree > 0 && seatsFree / s.seatsTotal < RULES.lowSeatsThreshold,
    };
  });
}
