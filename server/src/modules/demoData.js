import { CINEMA, localDate } from '@kinozavod/shared';
import { hashPassword } from './auth.js';
import { getSeatMap } from './seatmap.js';
import { createOrder, payOrder } from './orders.js';
import { sellAtBoxOffice } from './boxoffice.js';
import { createReview } from './reviews.js';
import { addToWatchlist } from './profile.js';

const TZ = CINEMA.timezone;

export const DEMO_ACCOUNTS = [
  {
    role: 'user',
    email: 'demo.user@kinozavod.ee',
    nickname: 'demo_kinolyub',
    firstName: 'Demo',
    lastName: 'Viewer',
    birthDate: '1995-05-20',
  },
  {
    role: 'cashier',
    email: 'demo.cashier@kinozavod.ee',
    nickname: 'demo_kassir',
    firstName: 'Demo',
    lastName: 'Cashier',
    birthDate: '1992-03-10',
  },
  {
    role: 'admin',
    email: 'demo.admin@kinozavod.ee',
    nickname: 'demo_admin',
    firstName: 'Demo',
    lastName: 'Admin',
    birthDate: '1988-01-15',
  },
];

/** Removes existing demo accounts and everything attached to them. */
export function clearDemoData(db) {
  const ids = db.prepare('SELECT id FROM users WHERE is_demo = 1').pluck().all();
  db.transaction(() => {
    for (const id of ids) {
      // orders of demo users → detach or delete their tickets/payments
      const orderIds = db.prepare('SELECT id FROM orders WHERE user_id = ?').pluck().all(id);
      for (const oid of orderIds) {
        db.prepare('DELETE FROM payments WHERE order_id = ?').run(oid);
        db.prepare('DELETE FROM tickets WHERE order_id = ?').run(oid);
        db.prepare('DELETE FROM orders WHERE id = ?').run(oid);
      }
      // box-office orders processed by the demo cashier
      const cashierOrders = db
        .prepare('SELECT id FROM orders WHERE cashier_id = ?')
        .pluck()
        .all(id);
      for (const oid of cashierOrders) {
        db.prepare('DELETE FROM payments WHERE order_id = ?').run(oid);
        db.prepare('DELETE FROM tickets WHERE order_id = ?').run(oid);
        db.prepare('DELETE FROM orders WHERE id = ?').run(oid);
      }
      db.prepare('DELETE FROM users WHERE id = ?').run(id); // cascades reviews, watchlist, sessions_auth
    }
  })();
}

/** A future, sellable session (optionally by hall code). */
function futureSession(db, now, hallCode) {
  const from = new Date(now.getTime() + 3 * 3600 * 1000).toISOString();
  return db
    .prepare(
      `SELECT s.id, s.start_time AS startTime, s.movie_id AS movieId FROM sessions s
       JOIN halls h ON h.id = s.hall_id
       JOIN movies m ON m.id = s.movie_id
       WHERE s.status = 'scheduled' AND s.start_time > ?
         AND (m.age_rating_ee IS NULL OR m.age_rating_ee NOT IN ('K-12','K-14','K-16'))
         ${hallCode ? 'AND h.code = ?' : ''}
       ORDER BY s.start_time LIMIT 1`,
    )
    .get(...(hallCode ? [from, hallCode] : [from]));
}

/**
 * (Re)creates the three demo accounts with sample data:
 *  - user: a paid online order, reviews (incl. a spoiler), a watchlist;
 *  - cashier: a couple of box-office sales today;
 *  - admin: no extra data needed.
 */
export async function seedDemoData(db, { now = new Date() } = {}) {
  clearDemoData(db);
  const passwordHash = await hashPassword('demo');
  const today = localDate(now, TZ);

  const insertUser = db.prepare(
    `INSERT INTO users (is_demo, email, password_hash, nickname, first_name, last_name, birth_date, role, email_verified)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, 1)`,
  );
  const ids = {};
  for (const a of DEMO_ACCOUNTS) {
    ids[a.role] = insertUser.run(
      a.email,
      passwordHash,
      a.nickname,
      a.firstName,
      a.lastName,
      a.birthDate,
      a.role,
    ).lastInsertRowid;
  }

  // --- user: online order (paid) ---
  const s1 = futureSession(db, now);
  if (s1) {
    const seatIds = getSeatMap(db, s1.id)
      .seats.filter((s) => s.status === 'free')
      .slice(0, 2)
      .map((s) => s.id);
    if (seatIds.length) {
      const { orderId } = createOrder(
        db,
        {
          sessionId: s1.id,
          seatIds,
          email: DEMO_ACCOUNTS[0].email,
          firstName: 'Demo',
          lastName: 'Viewer',
          userId: ids.user,
          locale: 'ru',
        },
        now,
      );
      payOrder(db, orderId, { cardNumber: '4111111111111111' }, now);
    }
  }

  // --- user: reviews (one with a spoiler) + watchlist ---
  const movies = db
    .prepare('SELECT id FROM movies WHERE is_archived = 0 ORDER BY id LIMIT 4')
    .pluck()
    .all();
  const reviewTexts = [
    { rating: 9, text: 'Атмосферно и стильно — один из лучших сеансов в KINOZAVOD.' },
    { rating: 7, text: 'Крепкое кино. ||В финале выясняется, что всё было сном.||' },
    { rating: 8, text: 'Отличная операторская работа, рекомендую.' },
  ];
  movies.slice(0, reviewTexts.length).forEach((movieId, i) => {
    try {
      createReview(db, {
        userId: ids.user,
        movieId,
        rating: reviewTexts[i].rating,
        text: reviewTexts[i].text,
      });
    } catch {
      /* ignore if a filter blocks it */
    }
  });
  for (const movieId of movies.slice(0, 3)) {
    try {
      addToWatchlist(db, { id: ids.user }, movieId);
    } catch {
      /* ignore */
    }
  }
  // also watchlist an upcoming movie if any
  const soon = db
    .prepare('SELECT id FROM movies WHERE rental_start > ? AND is_archived = 0 LIMIT 1')
    .pluck()
    .get(today);
  if (soon) {
    try {
      addToWatchlist(db, { id: ids.user }, soon);
    } catch {
      /* ignore */
    }
  }

  // --- cashier: a couple of box-office sales today ---
  for (const hallCode of ['p1', 'p2']) {
    const s = futureSession(db, now, hallCode);
    if (!s) continue;
    const seat = getSeatMap(db, s.id).seats.find((x) => x.status === 'free');
    if (!seat) continue;
    try {
      sellAtBoxOffice(
        db,
        {
          sessionId: s.id,
          seatIds: [seat.id],
          method: hallCode === 'p1' ? 'cash' : 'card_terminal',
          cashierId: ids.cashier,
        },
        now,
      );
    } catch {
      /* ignore */
    }
  }

  return ids;
}

/** True if demo accounts exist. */
export function demoDataExists(db) {
  return db.prepare('SELECT COUNT(*) FROM users WHERE is_demo = 1').pluck().get() > 0;
}
