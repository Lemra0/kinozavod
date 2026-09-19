import {
  AGE_RATINGS,
  CINEMA,
  RULES,
  addDays,
  ageOn,
  localDate,
  localTime,
  seatPrice,
  zonedTimeToDate,
} from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { getPriceSettings } from '../settings.js';
import { makeTicketCode } from './tokens.js';
import { emitSeatChanges } from './events.js';

const TZ = CINEMA.timezone;

/** Sessions running today that can still be sold at the desk (until start). */
export function todaySessions(db, { lang = 'en', now = new Date() } = {}) {
  const today = localDate(now, TZ);
  const rows = db
    .prepare(
      `SELECT s.id, s.start_time AS startTime, s.format,
              h.code AS hallCode, h.name_key AS hallNameKey,
              COALESCE(mt.title, m.original_title) AS movieTitle,
              m.age_rating_ee AS ageRating,
              (SELECT COUNT(*) FROM seats WHERE hall_id = s.hall_id AND is_active = 1) AS seatsTotal,
              (SELECT COUNT(*) FROM tickets t WHERE t.session_id = s.id
                 AND t.status IN ('reserved','valid','used')) AS seatsTaken
       FROM sessions s
       JOIN halls h ON h.id = s.hall_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE s.status = 'scheduled' AND date(s.start_time) >= date(?)
         AND s.start_time > ?
       ORDER BY s.start_time, h.code`,
    )
    .all(lang, now.toISOString(), now.toISOString());
  return rows
    .filter((s) => localDate(new Date(s.startTime), TZ) === today)
    .map((s) => ({
      id: s.id,
      startTime: s.startTime,
      localTime: localTime(new Date(s.startTime), TZ),
      format: s.format,
      hall: { code: s.hallCode, nameKey: s.hallNameKey },
      movieTitle: s.movieTitle,
      ageRating: s.ageRating,
      seatsFree: s.seatsTotal - s.seatsTaken,
      seatsTotal: s.seatsTotal,
    }));
}

/**
 * Sells seats at the box office: creates a paid order in one transaction,
 * tickets go straight to 'valid'. Payment method: cash or card_terminal (demo).
 * Sales are allowed until the session starts (later than online sales).
 */
export function sellAtBoxOffice(
  db,
  { sessionId, seatIds, method, email = null, firstName = null, lastName = null, cashierId },
  now = new Date(),
) {
  if (!['cash', 'card_terminal'].includes(method)) {
    throw new ApiError(400, 'BAD_METHOD', 'Payment method must be cash or card_terminal');
  }
  const uniqueSeatIds = [...new Set(seatIds)];
  if (uniqueSeatIds.length === 0) throw new ApiError(400, 'NO_SEATS', 'No seats selected');
  if (uniqueSeatIds.length !== seatIds.length) {
    throw new ApiError(400, 'DUPLICATE_SEATS', 'Duplicate seats');
  }
  if (uniqueSeatIds.length > RULES.maxSeatsPerOrder) {
    throw new ApiError(400, 'TOO_MANY_SEATS', `At most ${RULES.maxSeatsPerOrder} seats`);
  }

  const session = db
    .prepare(
      `SELECT s.id, s.hall_id AS hallId, s.format, s.start_time AS startTime
       FROM sessions s WHERE s.id = ? AND s.status = 'scheduled'`,
    )
    .get(sessionId);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');
  if (new Date(session.startTime).getTime() <= now.getTime()) {
    throw new ApiError(409, 'SESSION_STARTED', 'The session has already started');
  }

  const prices = getPriceSettings(db);
  const time = localTime(new Date(session.startTime), TZ);
  const placeholders = uniqueSeatIds.map(() => '?').join(',');
  const seats = db
    .prepare(
      `SELECT id, type FROM seats WHERE id IN (${placeholders}) AND hall_id = ? AND is_active = 1`,
    )
    .all(...uniqueSeatIds, session.hallId);
  if (seats.length !== uniqueSeatIds.length) {
    throw new ApiError(400, 'INVALID_SEATS', 'Some seats do not belong to this session');
  }

  const priceOf = (seat) =>
    seatPrice({ seatType: seat.type, format: session.format, localStartTime: time, prices });
  const total = seats.reduce((sum, seat) => sum + priceOf(seat), 0);

  const create = db.transaction(() => {
    const orderId = db
      .prepare(
        `INSERT INTO orders (email, buyer_first_name, buyer_last_name, age_check, locale,
                             session_id, channel, cashier_id, status, total)
         VALUES (?, ?, ?, 'none', 'et', ?, 'box_office', ?, 'paid', ?)`,
      )
      .run(email, firstName, lastName, sessionId, cashierId, total).lastInsertRowid;

    const insertTicket = db.prepare(
      `INSERT INTO tickets (order_id, session_id, seat_id, price, code, status)
       VALUES (?, ?, ?, ?, ?, 'valid')`,
    );
    for (const seat of seats)
      insertTicket.run(orderId, sessionId, seat.id, priceOf(seat), makeTicketCode());

    db.prepare(
      `INSERT INTO payments (order_id, amount, method, status, processed_by)
       VALUES (?, ?, ?, 'success', ?)`,
    ).run(orderId, total, method, cashierId);

    return orderId;
  });

  let orderId;
  try {
    orderId = create();
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(error.message).includes('UNIQUE')) {
      throw new ApiError(409, 'SEAT_TAKEN', 'One of the seats was just taken');
    }
    throw error;
  }

  emitSeatChanges(
    sessionId,
    seats.map((seat) => ({ seatId: seat.id, status: 'sold' })),
  );
  return { orderId, total };
}

/**
 * Looks up a ticket by code for check-in, without changing it.
 * Returns a verdict and details for the controller.
 */
export function lookupTicket(db, code, { lang = 'en' } = {}) {
  const ticket = db
    .prepare(
      `SELECT t.id, t.code, t.status, t.used_at AS usedAt, t.session_id AS sessionId,
              seat.row, seat.number, seat.type AS seatType,
              s.start_time AS startTime, s.format,
              h.name_key AS hallNameKey,
              o.buyer_first_name AS firstName, o.buyer_last_name AS lastName, o.age_check AS ageCheck,
              m.age_rating_ee AS ageRating,
              COALESCE(mt.title, m.original_title) AS movieTitle
       FROM tickets t
       JOIN seats seat ON seat.id = t.seat_id
       JOIN sessions s ON s.id = t.session_id
       JOIN halls h ON h.id = s.hall_id
       JOIN orders o ON o.id = t.order_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE t.code = ?`,
    )
    .get(lang, String(code).trim().toUpperCase());

  if (!ticket) return { verdict: 'not_found' };

  let verdict = 'valid';
  if (ticket.status === 'used') verdict = 'used';
  else if (ticket.status === 'refunded') verdict = 'refunded';
  else if (ticket.status === 'released' || ticket.status === 'reserved') verdict = 'not_paid';

  return {
    verdict,
    ticket: {
      code: ticket.code,
      status: ticket.status,
      usedAt: ticket.usedAt,
      movieTitle: ticket.movieTitle,
      hallNameKey: ticket.hallNameKey,
      row: ticket.row,
      number: ticket.number,
      seatType: ticket.seatType,
      startTime: ticket.startTime,
      format: ticket.format,
      ageRating: ticket.ageRating,
      buyerName: [ticket.firstName, ticket.lastName].filter(Boolean).join(' ') || null,
      ageCheck: ticket.ageCheck,
      sessionId: ticket.sessionId,
    },
  };
}

/**
 * Marks a valid ticket as used (admits the guest).
 * Check-in opens 1h before the session. Only 'valid' tickets can be used.
 */
export function useTicket(db, code, { cashierId, now = new Date() }) {
  const found = lookupTicket(db, code);
  if (found.verdict === 'not_found')
    throw new ApiError(404, 'TICKET_NOT_FOUND', 'Ticket not found');

  const t = found.ticket;
  if (found.verdict === 'used') {
    throw new ApiError(409, 'ALREADY_USED', 'Ticket already used', { usedAt: t.usedAt });
  }
  if (found.verdict !== 'valid') {
    throw new ApiError(409, 'NOT_USABLE', `Ticket is ${t.status}`, { status: t.status });
  }

  const opensAt = new Date(new Date(t.startTime).getTime() - RULES.checkInOpensMinutes * 60 * 1000);
  if (now < opensAt) {
    throw new ApiError(409, 'CHECKIN_NOT_OPEN', 'Check-in is not open yet', {
      opensAt: opensAt.toISOString(),
    });
  }

  const usedAt = now.toISOString();
  db.prepare("UPDATE tickets SET status = 'used', used_at = ?, checked_by = ? WHERE code = ?").run(
    usedAt,
    cashierId,
    String(code).trim().toUpperCase(),
  );
  return { ...found, verdict: 'admitted', ticket: { ...t, status: 'used', usedAt } };
}

/** Searches orders by id (#123), email or ticket code. */
export function searchOrders(db, query, { lang = 'en' } = {}) {
  const q = String(query ?? '').trim();
  if (!q) return [];

  let orderIds;
  if (/^#?\d+$/.test(q)) {
    orderIds = [Number(q.replace('#', ''))];
  } else if (q.includes('@')) {
    orderIds = db
      .prepare(
        'SELECT id FROM orders WHERE email = ? COLLATE NOCASE ORDER BY created_at DESC LIMIT 20',
      )
      .pluck()
      .all(q);
  } else {
    orderIds = db
      .prepare('SELECT order_id FROM tickets WHERE code = ? LIMIT 20')
      .pluck()
      .all(q.toUpperCase());
  }
  if (orderIds.length === 0) return [];

  const placeholders = orderIds.map(() => '?').join(',');
  return db
    .prepare(
      `SELECT o.id, o.status, o.total, o.channel, o.email, o.created_at AS createdAt,
              o.buyer_first_name AS firstName, o.buyer_last_name AS lastName,
              s.start_time AS startTime, s.format,
              h.name_key AS hallNameKey,
              COALESCE(mt.title, m.original_title) AS movieTitle,
              (SELECT COUNT(*) FROM tickets t WHERE t.order_id = o.id
                 AND t.status IN ('valid','used','reserved')) AS ticketCount
       FROM orders o
       JOIN sessions s ON s.id = o.session_id
       JOIN halls h ON h.id = s.hall_id
       JOIN movies m ON m.id = s.movie_id
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE o.id IN (${placeholders})
       ORDER BY o.created_at DESC`,
    )
    .all(lang, ...orderIds);
}

/** End-of-day summary for a cashier's shift (or the whole day). */
export function shiftSummary(db, { date, now = new Date() } = {}) {
  const day = date ?? localDate(now, TZ);
  // Day boundaries in Tallinn time, converted to the UTC strings stored in created_at.
  const start = zonedTimeToDate(day, '00:00', TZ).toISOString();
  const end = zonedTimeToDate(addDays(day, 1), '00:00', TZ).toISOString();

  const sales = db
    .prepare(
      `SELECT p.method,
              COUNT(*) AS count,
              SUM(CASE WHEN p.status = 'success' THEN p.amount ELSE 0 END) AS sold,
              SUM(CASE WHEN p.status = 'refunded' THEN p.amount ELSE 0 END) AS refunded
       FROM payments p
       WHERE p.created_at >= ? AND p.created_at < ?
       GROUP BY p.method`,
    )
    .all(start, end);

  const tickets = db
    .prepare(
      `SELECT COUNT(*) AS sold FROM tickets t
       JOIN orders o ON o.id = t.order_id
       WHERE o.created_at >= ? AND o.created_at < ? AND t.status IN ('valid','used')`,
    )
    .get(start, end);

  const refunds = db
    .prepare(
      `SELECT COUNT(*) AS count FROM payments WHERE status = 'refunded' AND created_at >= ? AND created_at < ?`,
    )
    .get(start, end);

  const byMethod = {};
  let totalSold = 0;
  let totalRefunded = 0;
  for (const row of sales) {
    byMethod[row.method] = { sold: row.sold ?? 0, refunded: row.refunded ?? 0 };
    totalSold += row.sold ?? 0;
    totalRefunded += row.refunded ?? 0;
  }

  return {
    date: day,
    ticketsSold: tickets.sold ?? 0,
    refundCount: refunds.count ?? 0,
    totalSold,
    totalRefunded,
    net: totalSold - totalRefunded,
    byMethod,
  };
}

/** Age-check label for the controller ('none' | 'profile' | 'demo_isikukood'). */
export function ageCheckInfo(ageCheck, ageRating) {
  const rating = AGE_RATINGS[ageRating];
  return { restricted: Boolean(rating?.restricted), minAge: rating?.minAge ?? 0, method: ageCheck };
}

export { ageOn };
