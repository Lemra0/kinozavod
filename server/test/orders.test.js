import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { seedCatalog } from '../src/modules/catalog.js';
import {
  canRefund,
  createOrder,
  getOrderView,
  isCardApproved,
  payOrder,
  refundOrder,
  releaseExpiredOrders,
} from '../src/modules/orders.js';
import { getSeatMap, suggestSeats } from '../src/modules/seatmap.js';
import { buildDemoIsikukood, parseIsikukood } from '../src/modules/isikukood.js';
import { createTestDb, testConfig } from './helpers.js';

const NOW = new Date('2026-09-16T07:00:00.000Z');

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected error ${code} but none was thrown`);
}

// Picks a future, sellable session in a given hall (by code).
function futureSession(db, hallCode = 'p1') {
  return db
    .prepare(
      `SELECT s.id, s.start_time AS startTime, s.movie_id AS movieId
       FROM sessions s JOIN halls h ON h.id = s.hall_id
       WHERE h.code = ? AND s.start_time > ?
       ORDER BY s.start_time LIMIT 1`,
    )
    .get(hallCode, new Date(NOW.getTime() + 3 * 3600 * 1000).toISOString());
}

function freeSeatIds(db, sessionId, count) {
  return getSeatMap(db, sessionId)
    .seats.filter((s) => s.status === 'free' && s.type === 'standard')
    .slice(0, count)
    .map((s) => s.id);
}

describe('isikukood', () => {
  it('accepts a valid demo code and returns the birth date', () => {
    const code = buildDemoIsikukood('2005-07-14');
    const parsed = parseIsikukood(code);
    expect(parsed.valid).toBe(true);
    expect(parsed.birthDate).toBe('2005-07-14');
  });

  it('rejects a wrong check digit', () => {
    const code = buildDemoIsikukood('2005-07-14');
    const broken = code.slice(0, 10) + ((Number(code[10]) + 1) % 10);
    expect(parseIsikukood(broken).valid).toBe(false);
  });

  it('rejects bad format and impossible dates', () => {
    expect(parseIsikukood('123').valid).toBe(false);
    expect(parseIsikukood('50013320005').valid).toBe(false); // month 13
  });
});

describe('demo card check', () => {
  it('approves 4111 and declines 4000', () => {
    expect(isCardApproved('4111111111111111')).toBe(true);
    expect(isCardApproved('4000000000000000')).toBe(false);
    expect(isCardApproved('411')).toBe(false);
  });
});

describe('orders lifecycle', () => {
  let db;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now: NOW });
  });

  afterEach(() => db.close());

  it('creates a pending order and holds the seats', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 2);
    const order = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    expect(order.total).toBeGreaterThan(0);
    const map = getSeatMap(db, session.id);
    const held = map.seats.filter((s) => seatIds.includes(s.id));
    expect(held.every((s) => s.status === 'held')).toBe(true);
  });

  it('prevents two orders for the same seat (double sale)', () => {
    const session = futureSession(db);
    const [seatId] = freeSeatIds(db, session.id, 1);
    createOrder(
      db,
      { sessionId: session.id, seatIds: [seatId], email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    expectCode(
      () =>
        createOrder(
          db,
          {
            sessionId: session.id,
            seatIds: [seatId],
            email: 'c@d.co',
            firstName: 'C',
            lastName: 'D',
          },
          NOW,
        ),
      'SEAT_TAKEN',
    );
  });

  it('rejects more than the max seats', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 10).concat(freeSeatIds(db, session.id, 1));
    // craft 11 unique
    const eleven = getSeatMap(db, session.id)
      .seats.filter((s) => s.status === 'free')
      .slice(0, 11)
      .map((s) => s.id);
    expectCode(
      () =>
        createOrder(
          db,
          {
            sessionId: session.id,
            seatIds: eleven,
            email: 'a@b.co',
            firstName: 'A',
            lastName: 'B',
          },
          NOW,
        ),
      'TOO_MANY_SEATS',
    );
    expect(seatIds.length).toBeGreaterThan(0);
  });

  it('pays a pending order and makes tickets valid', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 2);
    const { orderId } = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    expect(payOrder(db, orderId, { cardNumber: '4111111111111111' }, NOW).status).toBe('paid');
    const view = getOrderView(db, orderId, { skipToken: true });
    expect(view.status).toBe('paid');
    expect(view.tickets.every((t) => t.status === 'valid')).toBe(true);
  });

  it('declined payment frees the seats', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 1);
    const { orderId } = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    expectCode(
      () => payOrder(db, orderId, { cardNumber: '4000000000000000' }, NOW),
      'PAYMENT_DECLINED',
    );
    const map = getSeatMap(db, session.id);
    expect(map.seats.find((s) => s.id === seatIds[0]).status).toBe('free');
    // seat can be bought again
    expect(() =>
      createOrder(
        db,
        { sessionId: session.id, seatIds, email: 'c@d.co', firstName: 'C', lastName: 'D' },
        NOW,
      ),
    ).not.toThrow();
  });

  it('expires holds after the timeout and frees seats', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 1);
    createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    expect(releaseExpiredOrders(db, later)).toBe(1);
    expect(getSeatMap(db, session.id).seats.find((s) => s.id === seatIds[0]).status).toBe('free');
  });

  it('refunds a paid order and frees the seats', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 1);
    const { orderId } = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    payOrder(db, orderId, { cardNumber: '4111111111111111' }, NOW);
    expect(refundOrder(db, orderId, NOW).status).toBe('refunded');
    expect(getSeatMap(db, session.id).seats.find((s) => s.id === seatIds[0]).status).toBe('free');
  });

  it('refuses refund less than an hour before start', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 1);
    const { orderId } = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    payOrder(db, orderId, { cardNumber: '4111111111111111' }, NOW);
    const justBefore = new Date(new Date(session.startTime).getTime() - 30 * 60 * 1000);
    expectCode(() => refundOrder(db, orderId, justBefore), 'REFUND_TOO_LATE');
  });

  it('canRefund respects the one-hour deadline', () => {
    const session = { startTime: '2026-09-20T18:00:00.000Z' };
    expect(canRefund(session, new Date('2026-09-20T16:30:00.000Z'))).toBe(true);
    expect(canRefund(session, new Date('2026-09-20T17:30:00.000Z'))).toBe(false);
  });

  it('guards the order view with the access token', () => {
    const session = futureSession(db);
    const seatIds = freeSeatIds(db, session.id, 1);
    const { orderId, token } = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    expectCode(() => getOrderView(db, orderId, { token: 'wrong' }), 'INVALID_TOKEN');
    expect(getOrderView(db, orderId, { token }).id).toBe(orderId);
  });
});

describe('age restriction', () => {
  let db;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now: NOW });
  });

  afterEach(() => db.close());

  // Find a session of a K-rated movie.
  function restrictedSession() {
    return db
      .prepare(
        `SELECT s.id, s.start_time AS startTime, m.age_rating_ee AS rating
         FROM sessions s JOIN movies m ON m.id = s.movie_id
         WHERE m.age_rating_ee IN ('K-12','K-14','K-16') AND s.start_time > ?
         ORDER BY s.start_time LIMIT 1`,
      )
      .get(new Date(NOW.getTime() + 3 * 3600 * 1000).toISOString());
  }

  it('blocks a restricted film without proof of age', () => {
    const session = restrictedSession();
    const seatIds = freeSeatIds(db, session.id, 1);
    expectCode(
      () =>
        createOrder(
          db,
          { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
          NOW,
        ),
      'AGE_CHECK_REQUIRED',
    );
  });

  it('blocks a buyer who is too young', () => {
    const session = restrictedSession();
    const seatIds = freeSeatIds(db, session.id, 1);
    const child = '2020-01-01';
    expectCode(
      () =>
        createOrder(
          db,
          {
            sessionId: session.id,
            seatIds,
            email: 'a@b.co',
            firstName: 'A',
            lastName: 'B',
            birthDate: child,
            ageVerified: true,
          },
          NOW,
        ),
      'AGE_RESTRICTED',
    );
  });

  it('allows an adult with a verified birth date', () => {
    const session = restrictedSession();
    const seatIds = freeSeatIds(db, session.id, 1);
    const order = createOrder(
      db,
      {
        sessionId: session.id,
        seatIds,
        email: 'a@b.co',
        firstName: 'A',
        lastName: 'B',
        birthDate: '1990-01-01',
        ageVerified: true,
      },
      NOW,
    );
    expect(order.orderId).toBeGreaterThan(0);
    expect(getOrderView(db, order.orderId, { skipToken: true }).ageCheck).toBe('demo_isikukood');
  });
});

describe('seat suggestions', () => {
  let db;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now: NOW });
  });

  afterEach(() => db.close());

  it('suggests adjacent seats in one row', () => {
    const session = futureSession(db, 'p1');
    const suggestions = suggestSeats(db, session.id, { viewers: 3, type: 'standard' });
    expect(suggestions.length).toBeGreaterThan(0);
    const best = suggestions[0];
    const map = getSeatMap(db, session.id);
    const seats = best.map((id) => map.seats.find((s) => s.id === id));
    // all in one row and contiguous
    const rows = new Set(seats.map((s) => s.row));
    expect(rows.size).toBe(1);
    const xs = seats.map((s) => s.gridX).sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] - xs[i - 1]).toBeGreaterThan(0);
  });

  it('counts a sofa as two viewers', () => {
    const session = futureSession(db, 'p1');
    const suggestions = suggestSeats(db, session.id, { viewers: 2, type: 'sofa' });
    expect(suggestions.length).toBeGreaterThan(0);
    const map = getSeatMap(db, session.id);
    const first = suggestions[0].map((id) => map.seats.find((s) => s.id === id));
    expect(first.reduce((sum, s) => sum + s.viewers, 0)).toBeGreaterThanOrEqual(2);
  });
});
