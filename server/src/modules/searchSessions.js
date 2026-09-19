import {
  CINEMA,
  RULES,
  addDays,
  localDate,
  localTime,
  seatPrice,
  weekdayOf,
  zonedTimeToDate,
} from '@kinozavod/shared';
import { getPriceSettings } from '../settings.js';
import { searchMovieIds } from './search.js';

const TZ = CINEMA.timezone;

const TIME_BANDS = {
  morning: ['00:00', '12:00'],
  afternoon: ['12:00', '17:00'],
  evening: ['17:00', '21:00'],
  late: ['21:00', '24:00'],
};

/** Resolves the [from, to) instant range for a named period or a custom pair. */
export function resolveDateRange({ period, from, to }, today) {
  const horizon = addDays(today, RULES.scheduleHorizonDays);
  const clamp = (date) => (date < today ? today : date > horizon ? horizon : date);
  let start = today;
  let endExclusive = addDays(today, 1);

  switch (period) {
    case 'today':
      break;
    case 'tomorrow':
      start = addDays(today, 1);
      endExclusive = addDays(today, 2);
      break;
    case 'week':
      endExclusive = addDays(today, 7);
      break;
    case 'next-week': {
      const daysUntilNextMonday = (8 - weekdayOf(today)) % 7 || 7;
      start = addDays(today, daysUntilNextMonday);
      endExclusive = addDays(start, 7);
      break;
    }
    case 'month':
      endExclusive = addDays(today, 30);
      break;
    case 'custom':
      start = from ?? today;
      endExclusive = addDays(to ?? from ?? today, 1);
      break;
    default:
      endExclusive = addDays(today, RULES.scheduleHorizonDays);
  }

  start = clamp(start);
  endExclusive = clamp(endExclusive);
  if (endExclusive <= start) endExclusive = addDays(start, 1);

  return {
    fromDate: start,
    toDate: addDays(endExclusive, -1),
    fromInstant: zonedTimeToDate(start, '00:00', TZ).toISOString(),
    toInstant: zonedTimeToDate(endExclusive, '00:00', TZ).toISOString(),
  };
}

/** Cheapest seat type per hall, for the "price from" of a session. */
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

/** True if the seat map has `count` free seats next to each other in one row. */
function hasAdjacentFree(db, sessionId, hallId, count) {
  if (count <= 1) return true;
  const seats = db
    .prepare(
      `SELECT s.row, s.grid_x AS gridX, s.width,
              CASE WHEN t.id IS NULL THEN 0 ELSE 1 END AS taken
       FROM seats s
       LEFT JOIN tickets t
         ON t.seat_id = s.id AND t.session_id = ?
        AND t.status IN ('reserved', 'valid', 'used')
       WHERE s.hall_id = ? AND s.is_active = 1
       ORDER BY s.row, s.grid_x`,
    )
    .all(sessionId, hallId);

  const byRow = new Map();
  for (const seat of seats) {
    if (!byRow.has(seat.row)) byRow.set(seat.row, []);
    byRow.get(seat.row).push(seat);
  }

  for (const row of byRow.values()) {
    let run = 0;
    let prevEnd = null;
    for (const seat of row) {
      const contiguous = prevEnd === null || seat.gridX === prevEnd;
      if (seat.taken) {
        run = 0;
      } else {
        run = contiguous ? run + seat.width : seat.width;
        if (run >= count) return true;
      }
      prevEnd = seat.gridX + seat.width;
    }
  }
  return false;
}

const SORTS = {
  time: 's.start_time ASC, h.code ASC',
  title: 'title ASC, s.start_time ASC',
  rating: 'rating DESC, s.start_time ASC',
  popularity: 'recent_sales DESC, m.popularity DESC, s.start_time ASC',
  price: 'price_from ASC, s.start_time ASC',
  duration: 'm.duration_min ASC, s.start_time ASC',
};

/**
 * Full session search with filters and sorting (spec 6.12).
 * Returns { total, sessions } where each session carries its movie id.
 * `sessions` is already the requested page.
 */
export function searchSessions(db, filters, { now = new Date() } = {}) {
  const today = localDate(now, TZ);
  const range = resolveDateRange(filters, today);
  const lang = filters.lang;

  const where = [
    "s.status = 'scheduled'",
    's.start_time >= ?',
    's.start_time < ?',
    's.start_time > ?', // hide sessions that already started
  ];
  const params = [range.fromInstant, range.toInstant, now.toISOString()];

  if (filters.format) {
    where.push('s.format = ?');
    params.push(filters.format);
  }
  if (filters.hall) {
    where.push('h.code = ?');
    params.push(filters.hall);
  }
  if (filters.language) {
    where.push('s.language = ?');
    params.push(filters.language);
  }
  if (filters.zavodSound) {
    where.push('h.has_zavod_sound = 1');
  }
  if (filters.maxDuration) {
    where.push('m.duration_min <= ?');
    params.push(filters.maxDuration);
  }

  // Age filter
  if (filters.age === 'no-restricted') {
    where.push("(m.age_rating_ee IS NULL OR m.age_rating_ee NOT IN ('K-12', 'K-14', 'K-16'))");
  } else if (filters.age === 'family') {
    where.push("m.age_rating_ee IN ('PERE', 'L')");
  }

  // Time band or custom time window (compared in local Tallinn time)
  let timeFrom = null;
  let timeTo = null;
  if (filters.timeBand && TIME_BANDS[filters.timeBand]) {
    [timeFrom, timeTo] = TIME_BANDS[filters.timeBand];
  }
  if (filters.timeFrom) timeFrom = filters.timeFrom;
  if (filters.timeTo) timeTo = filters.timeTo;

  // Text search narrows to matching movie ids
  if (filters.q && filters.q.trim().length >= 2) {
    const ids = searchMovieIds(db, filters.q, 200);
    if (ids.length === 0) return { total: 0, sessions: [], range };
    where.push(`s.movie_id IN (${ids.map(() => '?').join(',')})`);
    params.push(...ids);
  }

  // Genre filter (movie must have all requested genres)
  if (filters.genres?.length) {
    where.push(
      `s.movie_id IN (
         SELECT movie_id FROM movie_genres
         WHERE genre_id IN (${filters.genres.map(() => '?').join(',')})
         GROUP BY movie_id HAVING COUNT(DISTINCT genre_id) = ?
       )`,
    );
    params.push(...filters.genres, filters.genres.length);
  }

  const sql = `
    SELECT s.id, s.movie_id AS movieId, s.hall_id AS hallId, s.start_time AS startTime,
           s.end_time AS endTime, s.format, s.language, s.subtitles,
           h.code AS hallCode, h.name_key AS hallNameKey, h.has_zavod_sound AS zavodSound,
           m.duration_min,
           (SELECT title FROM movie_translations WHERE movie_id = s.movie_id AND locale = ?) AS title,
           (SELECT AVG(rating) FROM reviews WHERE movie_id = s.movie_id AND is_hidden = 0) AS rating,
           (SELECT COUNT(*) FROM tickets t
              JOIN orders o ON o.id = t.order_id
              WHERE t.session_id IN (SELECT id FROM sessions WHERE movie_id = s.movie_id)
                AND o.created_at > ? AND t.status IN ('valid', 'used')) AS recent_sales,
           (SELECT COUNT(*) FROM seats WHERE hall_id = s.hall_id AND is_active = 1) AS seatsTotal,
           (SELECT COUNT(*) FROM tickets t WHERE t.session_id = s.id
              AND t.status IN ('reserved', 'valid', 'used')) AS seatsTaken,
           (SELECT MIN(CASE seat.type WHEN 'standard' THEN 0 WHEN 'vip' THEN 1 ELSE 2 END)
              FROM seats seat WHERE seat.hall_id = s.hall_id AND seat.is_active = 1) AS cheapestRank
    FROM sessions s
    JOIN halls h ON h.id = s.hall_id
    JOIN movies m ON m.id = s.movie_id
    WHERE ${where.join(' AND ')}
  `;

  const weekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
  const rows = db.prepare(sql).all(lang, weekAgo, ...params);

  const prices = getPriceSettings(db);
  const cheapest = cheapestSeatTypes(db);
  const weekdays = filters.weekdays?.length ? new Set(filters.weekdays) : null;

  // Post-filters that need local time / seat maps, and price computation.
  let enriched = rows.map((s) => {
    const start = new Date(s.startTime);
    const time = localTime(start, TZ);
    const date = localDate(start, TZ);
    const seatsFree = s.seatsTotal - s.seatsTaken;
    return {
      raw: s,
      priceFrom: seatPrice({
        seatType: cheapest.get(s.hallId) ?? 'standard',
        format: s.format,
        localStartTime: time,
        prices,
      }),
      localTime: time,
      localDate: date,
      seatsFree,
    };
  });

  enriched = enriched.filter((e) => {
    if (timeFrom && e.localTime < timeFrom) return false;
    if (timeTo && e.localTime >= timeTo) return false;
    if (weekdays && !weekdays.has(weekdayOf(e.localDate))) return false;
    if (filters.hasSeats && e.seatsFree <= 0) return false;
    return true;
  });

  // Seat-based filters (premium seats, N adjacent) — evaluated last, they are heavier.
  if (filters.premiumSeats) {
    const premium = db.prepare(
      `SELECT COUNT(*) FROM seats seat
       WHERE seat.hall_id = ? AND seat.is_active = 1 AND seat.type IN ('vip', 'sofa')
         AND seat.id NOT IN (
           SELECT seat_id FROM tickets WHERE session_id = ?
             AND status IN ('reserved', 'valid', 'used'))`,
    );
    enriched = enriched.filter((e) => premium.pluck().get(e.raw.hallId, e.raw.id) > 0);
  }
  if (filters.together > 1) {
    enriched = enriched.filter((e) =>
      hasAdjacentFree(db, e.raw.id, e.raw.hallId, filters.together),
    );
  }

  // Sorting
  const sortKey = filters.sort in SORTS ? filters.sort : 'time';
  const compare = {
    time: (a, b) => a.raw.startTime.localeCompare(b.raw.startTime),
    title: (a, b) => (a.raw.title ?? '').localeCompare(b.raw.title ?? ''),
    rating: (a, b) => (b.raw.rating ?? 0) - (a.raw.rating ?? 0),
    popularity: (a, b) => b.raw.recent_sales - a.raw.recent_sales || b.raw.movieId - a.raw.movieId,
    price: (a, b) => a.priceFrom - b.priceFrom,
    duration: (a, b) => a.raw.duration_min - b.raw.duration_min,
  }[sortKey];
  enriched.sort((a, b) => compare(a, b) || a.raw.startTime.localeCompare(b.raw.startTime));

  const total = enriched.length;
  const pageSize = 20;
  const page = filters.page ?? 0;
  const slice = enriched.slice(page * pageSize, page * pageSize + pageSize);

  const nowMs = now.getTime();
  const closeMs = RULES.onlineSalesCloseMinutes * 60 * 1000;
  const sessions = slice.map((e) => {
    const s = e.raw;
    return {
      id: s.id,
      movieId: s.movieId,
      startTime: s.startTime,
      endTime: s.endTime,
      localDate: e.localDate,
      localTime: e.localTime,
      format: s.format,
      language: s.language,
      subtitles: s.subtitles ? s.subtitles.split(',') : [],
      hall: { code: s.hallCode, nameKey: s.hallNameKey, zavodSound: Boolean(s.zavodSound) },
      priceFrom: e.priceFrom,
      seatsTotal: s.seatsTotal,
      seatsFree: e.seatsFree,
      salesClosed: new Date(s.startTime).getTime() - closeMs <= nowMs,
      soldOut: e.seatsFree <= 0,
      lowSeats: e.seatsFree > 0 && e.seatsFree / s.seatsTotal < RULES.lowSeatsThreshold,
      past: false,
    };
  });

  return { total, sessions, range, pageSize, page };
}
