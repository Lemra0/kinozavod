import {
  AGE_RATINGS,
  CINEMA,
  RULES,
  ageOn,
  localDate,
  localTime,
  seatPrice,
} from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { getPriceSettings } from '../settings.js';
import { hashToken, makeTicketCode, makeToken } from './tokens.js';
import { emitSeatChanges } from './events.js';

const TZ = CINEMA.timezone;

/** Loads a session for buying and checks it is still open for online sales. */
function loadSellableSession(db, sessionId, now) {
  const session = db
    .prepare(
      `SELECT s.id, s.movie_id AS movieId, s.hall_id AS hallId, s.format,
              s.start_time AS startTime,
              m.age_rating_ee AS ageRating
       FROM sessions s JOIN movies m ON m.id = s.movie_id
       WHERE s.id = ? AND s.status = 'scheduled'`,
    )
    .get(sessionId);
  if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');

  const start = new Date(session.startTime).getTime();
  const closeMs = RULES.onlineSalesCloseMinutes * 60 * 1000;
  if (start - closeMs <= now.getTime()) {
    throw new ApiError(409, 'SALES_CLOSED', 'Online sales for this session are closed');
  }
  return session;
}

/**
 * Frees seats of pending orders whose hold has expired.
 * Called before every seat read/write so the map stays truthful.
 */
/** Returns { sessionId, seatIds } of the tickets in an order (any status). */
function orderSeats(db, orderId) {
  const rows = db
    .prepare('SELECT session_id AS sessionId, seat_id AS seatId FROM tickets WHERE order_id = ?')
    .all(orderId);
  return {
    sessionId: rows[0]?.sessionId ?? null,
    seatIds: rows.map((r) => r.seatId),
  };
}

export function releaseExpiredOrders(db, now = new Date()) {
  const nowIso = now.toISOString();
  const expired = db
    .prepare("SELECT id FROM orders WHERE status = 'pending' AND expires_at <= ?")
    .pluck()
    .all(nowIso);
  if (expired.length === 0) return 0;

  const freed = [];
  const release = db.transaction(() => {
    for (const orderId of expired) {
      const { sessionId, seatIds } = orderSeats(db, orderId);
      db.prepare(
        "UPDATE tickets SET status = 'released' WHERE order_id = ? AND status = 'reserved'",
      ).run(orderId);
      db.prepare("UPDATE orders SET status = 'expired' WHERE id = ?").run(orderId);
      if (sessionId) freed.push({ sessionId, seatIds });
    }
  });
  release();
  for (const { sessionId, seatIds } of freed) {
    emitSeatChanges(
      sessionId,
      seatIds.map((seatId) => ({ seatId, status: 'free' })),
    );
  }
  return expired.length;
}

/**
 * Checks whether a buyer of the given birth date may watch a restricted film.
 * Returns the age-check mode to store, or throws if too young.
 */
function checkAge(session, { birthDate, ageVerified }) {
  const rating = AGE_RATINGS[session.ageRating];
  if (!rating?.restricted) return birthDate ? 'profile' : 'none';

  const sessionDate = localDate(new Date(session.startTime), TZ);
  if (birthDate) {
    if (ageOn(birthDate, sessionDate) < rating.minAge) {
      throw new ApiError(403, 'AGE_RESTRICTED', 'The buyer is under the age limit', {
        minAge: rating.minAge,
      });
    }
    return ageVerified ? 'demo_isikukood' : 'profile';
  }
  // Restricted film, no proof of age.
  throw new ApiError(403, 'AGE_CHECK_REQUIRED', 'Age verification is required', {
    minAge: rating.minAge,
  });
}

/**
 * Creates a pending order and reserves the seats, all in one transaction.
 * `birthDate` (optional) comes from a passed isikukood check for restricted films.
 */
export function createOrder(
  db,
  {
    sessionId,
    seatIds,
    email,
    firstName,
    lastName,
    locale = 'en',
    birthDate,
    ageVerified,
    userId = null,
  },
  now = new Date(),
) {
  releaseExpiredOrders(db, now);

  if (!Array.isArray(seatIds) || seatIds.length === 0) {
    throw new ApiError(400, 'NO_SEATS', 'No seats selected');
  }
  const uniqueSeatIds = [...new Set(seatIds)];
  if (uniqueSeatIds.length !== seatIds.length) {
    throw new ApiError(400, 'DUPLICATE_SEATS', 'Duplicate seats in the order');
  }
  if (seatIds.length > RULES.maxSeatsPerOrder) {
    throw new ApiError(400, 'TOO_MANY_SEATS', `At most ${RULES.maxSeatsPerOrder} seats per order`);
  }

  const session = loadSellableSession(db, sessionId, now);
  const ageCheck = checkAge(session, { birthDate, ageVerified });

  const prices = getPriceSettings(db);
  const time = localTime(new Date(session.startTime), TZ);

  // Validate seats belong to this hall and are active.
  const placeholders = uniqueSeatIds.map(() => '?').join(',');
  const seats = db
    .prepare(
      `SELECT id, type FROM seats
       WHERE id IN (${placeholders}) AND hall_id = ? AND is_active = 1`,
    )
    .all(...uniqueSeatIds, session.hallId);
  if (seats.length !== uniqueSeatIds.length) {
    throw new ApiError(400, 'INVALID_SEATS', 'Some seats do not belong to this session');
  }

  const total = seats.reduce(
    (sum, seat) =>
      sum +
      seatPrice({ seatType: seat.type, format: session.format, localStartTime: time, prices }),
    0,
  );

  const { token, hash } = makeToken();
  const expiresAt = new Date(now.getTime() + RULES.seatHoldMinutes * 60 * 1000).toISOString();

  const create = db.transaction(() => {
    const orderId = db
      .prepare(
        `INSERT INTO orders (user_id, email, buyer_first_name, buyer_last_name, age_check, locale,
                             session_id, channel, status, total, access_token_hash, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'online', 'pending', ?, ?, ?)`,
      )
      .run(
        userId,
        email,
        firstName,
        lastName,
        ageCheck,
        locale,
        sessionId,
        total,
        hash,
        expiresAt,
      ).lastInsertRowid;

    const insertTicket = db.prepare(
      `INSERT INTO tickets (order_id, session_id, seat_id, price, code, status)
       VALUES (?, ?, ?, ?, ?, 'reserved')`,
    );
    for (const seat of seats) {
      const price = seatPrice({
        seatType: seat.type,
        format: session.format,
        localStartTime: time,
        prices,
      });
      // The unique index guards against a concurrent buyer taking the same seat.
      insertTicket.run(orderId, sessionId, seat.id, price, makeTicketCode());
    }
    return orderId;
  });

  let orderId;
  try {
    orderId = create();
  } catch (error) {
    // The partial unique index ux_ticket_seat rejects a seat taken concurrently.
    const isUnique =
      error.code === 'SQLITE_CONSTRAINT_UNIQUE' || String(error.message).includes('UNIQUE');
    if (isUnique) {
      throw new ApiError(409, 'SEAT_TAKEN', 'One of the seats was just taken');
    }
    throw error;
  }

  emitSeatChanges(
    sessionId,
    seats.map((seat) => ({ seatId: seat.id, status: 'held' })),
  );

  return { orderId, token, total, expiresAt };
}

/** Test demo cards: 4111… always succeeds, 4000… is always declined. */
export function isCardApproved(cardNumber) {
  const digits = String(cardNumber ?? '').replace(/\s/g, '');
  if (digits.startsWith('4000')) return false;
  return /^\d{16}$/.test(digits);
}

/**
 * Pays for a pending order (demo). Turns reserved tickets into valid ones.
 * Returns { status: 'paid' } or throws with a code the client can show.
 */
export function payOrder(db, orderId, { cardNumber }, now = new Date()) {
  releaseExpiredOrders(db, now);

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');
  if (order.status === 'paid') return { status: 'paid' };
  if (order.status === 'expired') throw new ApiError(409, 'ORDER_EXPIRED', 'The hold has expired');
  if (order.status !== 'pending')
    throw new ApiError(409, 'ORDER_NOT_PAYABLE', 'Order cannot be paid');

  const last4 = String(cardNumber ?? '')
    .replace(/\s/g, '')
    .slice(-4);

  if (!isCardApproved(cardNumber)) {
    db.transaction(() => {
      db.prepare(
        `INSERT INTO payments (order_id, amount, method, status, card_last4)
         VALUES (?, ?, 'card_demo', 'declined', ?)`,
      ).run(orderId, order.total, last4);
      db.prepare(
        "UPDATE tickets SET status = 'released' WHERE order_id = ? AND status = 'reserved'",
      ).run(orderId);
      db.prepare("UPDATE orders SET status = 'failed' WHERE id = ?").run(orderId);
    })();
    const declined = orderSeats(db, orderId);
    emitSeatChanges(
      declined.sessionId,
      declined.seatIds.map((seatId) => ({ seatId, status: 'free' })),
    );
    throw new ApiError(402, 'PAYMENT_DECLINED', 'The card was declined');
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (order_id, amount, method, status, card_last4)
       VALUES (?, ?, 'card_demo', 'success', ?)`,
    ).run(orderId, order.total, last4);
    db.prepare(
      "UPDATE tickets SET status = 'valid' WHERE order_id = ? AND status = 'reserved'",
    ).run(orderId);
    db.prepare("UPDATE orders SET status = 'paid', expires_at = NULL WHERE id = ?").run(orderId);
  })();

  const paid = orderSeats(db, orderId);
  emitSeatChanges(
    paid.sessionId,
    paid.seatIds.map((seatId) => ({ seatId, status: 'sold' })),
  );

  return { status: 'paid' };
}

/** Whether a paid order can still be refunded (spec: up to 1h before start). */
export function canRefund(session, now) {
  const deadline = new Date(session.startTime).getTime() - RULES.refundDeadlineMinutes * 60 * 1000;
  return now.getTime() < deadline;
}

/** Refunds a paid order: tickets become 'refunded', seats free up. */
export function refundOrder(db, orderId, now = new Date()) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');
  if (order.status === 'refunded') return { status: 'refunded' };
  if (order.status !== 'paid') throw new ApiError(409, 'NOT_REFUNDABLE', 'Order is not paid');

  const session = db
    .prepare('SELECT start_time AS startTime FROM sessions WHERE id = ?')
    .get(order.session_id);
  if (!canRefund(session, now)) {
    throw new ApiError(409, 'REFUND_TOO_LATE', 'Too late to refund this order');
  }

  db.transaction(() => {
    db.prepare(
      `INSERT INTO payments (order_id, amount, method, status, card_last4)
       SELECT ?, amount, method, 'refunded', card_last4 FROM payments
       WHERE order_id = ? AND status = 'success' LIMIT 1`,
    ).run(orderId, orderId);
    db.prepare(
      "UPDATE tickets SET status = 'refunded' WHERE order_id = ? AND status IN ('valid', 'used')",
    ).run(orderId);
    db.prepare("UPDATE orders SET status = 'refunded' WHERE id = ?").run(orderId);
  })();

  const refunded = orderSeats(db, orderId);
  emitSeatChanges(
    refunded.sessionId,
    refunded.seatIds.map((seatId) => ({ seatId, status: 'free' })),
  );

  return { status: 'refunded' };
}

/**
 * Loads a full order for display, in the given language.
 * Verifies the access token (guest link) unless `skipToken` is set.
 */
export function getOrderView(db, orderId, { token, skipToken = false, lang = 'en' } = {}) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) throw new ApiError(404, 'ORDER_NOT_FOUND', 'Order not found');

  if (!skipToken) {
    if (!token || !order.access_token_hash || hashToken(token) !== order.access_token_hash) {
      throw new ApiError(403, 'INVALID_TOKEN', 'Invalid or missing access token');
    }
  }

  const session = db
    .prepare(
      `SELECT s.id, s.start_time AS startTime, s.end_time AS endTime, s.format, s.language,
              s.movie_id AS movieId, h.code AS hallCode, h.name_key AS hallNameKey,
              h.has_zavod_sound AS zavodSound
       FROM sessions s JOIN halls h ON h.id = s.hall_id WHERE s.id = ?`,
    )
    .get(order.session_id);

  const movie = db
    .prepare(
      `SELECT m.age_rating_ee AS ageRating, m.duration_min AS durationMin,
              COALESCE(mt.title, m.original_title) AS title, m.original_title AS originalTitle
       FROM movies m
       LEFT JOIN movie_translations mt ON mt.movie_id = m.id AND mt.locale = ?
       WHERE m.id = ?`,
    )
    .get(lang, session.movieId);

  const tickets = db
    .prepare(
      `SELECT t.id, t.code, t.price, t.status, seat.row, seat.number, seat.type
       FROM tickets t JOIN seats seat ON seat.id = t.seat_id
       WHERE t.order_id = ? AND t.status IN ('reserved', 'valid', 'used', 'refunded')
       ORDER BY seat.row, seat.number`,
    )
    .all(orderId);

  const now = new Date();
  return {
    id: order.id,
    status: order.status,
    email: order.email,
    buyer: { firstName: order.buyer_first_name, lastName: order.buyer_last_name },
    locale: order.locale,
    total: order.total,
    expiresAt: order.expires_at,
    createdAt: order.created_at,
    ageCheck: order.age_check,
    session: {
      id: session.id,
      startTime: session.startTime,
      endTime: session.endTime,
      localDate: localDate(new Date(session.startTime), TZ),
      localTime: localTime(new Date(session.startTime), TZ),
      format: session.format,
      language: session.language,
      hall: {
        code: session.hallCode,
        nameKey: session.hallNameKey,
        zavodSound: Boolean(session.zavodSound),
      },
    },
    movie,
    tickets,
    canRefund: order.status === 'paid' && canRefund(session, now),
  };
}
