import { SEAT_TYPES, localDate, localTime, seatPrice, CINEMA } from '@kinozavod/shared';
import { getPriceSettings } from '../settings.js';

const TZ = CINEMA.timezone;

/**
 * Full seat map of a session: every active seat with its status and price.
 * Status: 'free' | 'held' (reserved by a pending order) | 'sold'.
 */
export function getSeatMap(db, sessionId, lang = 'en') {
  const session = db
    .prepare(
      `SELECT s.id, s.hall_id AS hallId, s.format, s.start_time AS startTime, s.movie_id AS movieId,
              h.code AS hallCode, h.name_key AS hallNameKey,
              COALESCE(mt.title, m.original_title) AS movieTitle,
              m.age_rating_ee AS ageRating
       FROM sessions s
       JOIN halls h ON h.id = s.hall_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE s.id = ? AND s.status = 'scheduled'`,
    )
    .get(lang, sessionId);
  if (!session) return null;

  const prices = getPriceSettings(db);
  const time = localTime(new Date(session.startTime), TZ);

  const seats = db
    .prepare(
      `SELECT seat.id, seat.row, seat.number, seat.type, seat.grid_x AS gridX,
              seat.grid_y AS gridY, seat.width,
              t.status AS ticketStatus, o.status AS orderStatus
       FROM seats seat
       LEFT JOIN tickets t ON t.seat_id = seat.id AND t.session_id = ?
         AND t.status IN ('reserved', 'valid', 'used')
       LEFT JOIN orders o ON o.id = t.order_id
       WHERE seat.hall_id = ? AND seat.is_active = 1
       ORDER BY seat.grid_y, seat.grid_x`,
    )
    .all(sessionId, session.hallId)
    .map((seat) => {
      let status = 'free';
      if (seat.ticketStatus === 'reserved') status = 'held';
      else if (seat.ticketStatus) status = 'sold';
      return {
        id: seat.id,
        row: seat.row,
        number: seat.number,
        type: seat.type,
        gridX: seat.gridX,
        gridY: seat.gridY,
        width: seat.width,
        viewers: SEAT_TYPES[seat.type].viewers,
        status,
        price: seatPrice({
          seatType: seat.type,
          format: session.format,
          localStartTime: time,
          prices,
        }),
      };
    });

  const rows = Math.max(...seats.map((s) => s.gridY)) + 1;
  const cols = Math.max(...seats.map((s) => s.gridX + s.width));

  return {
    sessionId: session.id,
    movieId: session.movieId,
    movieTitle: session.movieTitle,
    ageRating: session.ageRating,
    startTime: session.startTime,
    localDate: localDate(new Date(session.startTime), TZ),
    localTime: time,
    hall: { code: session.hallCode, nameKey: session.hallNameKey },
    format: session.format,
    grid: { rows, cols },
    seats,
  };
}

/**
 * Suggests the best set of free seats for `viewers` people.
 * Prefers seats together in one row near the centre and ~2/3 deep;
 * falls back to two adjacent rows. Returns an array of suggestions (best first).
 */
export function suggestSeats(db, sessionId, { viewers, type = 'any' }) {
  const map = getSeatMap(db, sessionId);
  if (!map) return [];

  const free = map.seats.filter((s) => s.status === 'free' && (type === 'any' || s.type === type));
  const seatsNeededFor = (list) => list.reduce((sum, s) => sum + s.viewers, 0);

  const byRow = new Map();
  for (const seat of free) {
    if (!byRow.has(seat.row)) byRow.set(seat.row, []);
    byRow.get(seat.row).push(seat);
  }
  for (const list of byRow.values()) list.sort((a, b) => a.gridX - b.gridX);

  const depth = map.grid.rows;
  const width = map.grid.cols;
  const idealRow = Math.round(depth * (2 / 3));
  const idealCol = width / 2;

  // Score a contiguous block: lower is better.
  const scoreBlock = (block) => {
    const rowIndex = block[0].gridY;
    const centreX = block.reduce((s, x) => s + x.gridX + x.width / 2, 0) / block.length;
    const depthPenalty = Math.abs(rowIndex + 1 - idealRow) * 2;
    const centrePenalty = Math.abs(centreX - idealCol);
    return depthPenalty + centrePenalty;
  };

  const suggestions = [];

  // 1) Contiguous runs within a single row.
  for (const list of byRow.values()) {
    for (let i = 0; i < list.length; i += 1) {
      const block = [];
      let prevEnd = null;
      for (let j = i; j < list.length; j += 1) {
        const seat = list[j];
        if (prevEnd !== null && seat.gridX !== prevEnd) break;
        block.push(seat);
        prevEnd = seat.gridX + seat.width;
        if (seatsNeededFor(block) >= viewers) {
          const chosen = block.slice();
          suggestions.push({ seats: chosen, score: scoreBlock(chosen), rows: 1 });
          break;
        }
      }
    }
  }

  // 2) Two adjacent rows, one behind another (only if single-row failed).
  if (suggestions.length === 0) {
    const rowNumbers = [...byRow.keys()].sort((a, b) => a - b);
    for (const row of rowNumbers) {
      const next = byRow.get(row + 1);
      const here = byRow.get(row);
      if (!next) continue;
      const combined = [...here, ...next].sort((a, b) => a.gridY - b.gridY || a.gridX - b.gridX);
      if (seatsNeededFor(combined) >= viewers) {
        // take the cheapest-scoring subset greedily near centre
        const chosen = [];
        for (const seat of combined.sort(
          (a, b) =>
            Math.abs(a.gridX + a.width / 2 - idealCol) - Math.abs(b.gridX + b.width / 2 - idealCol),
        )) {
          chosen.push(seat);
          if (seatsNeededFor(chosen) >= viewers) break;
        }
        suggestions.push({ seats: chosen, score: scoreBlock(chosen) + 5, rows: 2 });
      }
    }
  }

  suggestions.sort((a, b) => a.score - b.score);
  return suggestions.map((s) => s.seats.map((seat) => seat.id));
}
