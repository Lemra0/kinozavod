import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { io as ioClient } from 'socket.io-client';
import { seedCatalog } from '../src/modules/catalog.js';
import { getSeatMap } from '../src/modules/seatmap.js';
import { createOrder, payOrder, refundOrder, releaseExpiredOrders } from '../src/modules/orders.js';
import { seatEvents } from '../src/modules/events.js';
import { attachRealtime } from '../src/modules/realtime.js';
import { createTestDb, testConfig } from './helpers.js';

const NOW = new Date('2026-09-16T07:00:00.000Z');

function futureSession(db) {
  return db
    .prepare(
      `SELECT s.id, s.start_time AS startTime FROM sessions s JOIN movies m ON m.id=s.movie_id
       WHERE (m.age_rating_ee IS NULL OR m.age_rating_ee NOT IN ('K-12','K-14','K-16'))
         AND s.start_time > ? ORDER BY s.start_time LIMIT 1`,
    )
    .get(new Date(NOW.getTime() + 3 * 3600 * 1000).toISOString());
}
function freeSeats(db, sessionId, n) {
  return getSeatMap(db, sessionId)
    .seats.filter((s) => s.status === 'free' && s.type === 'standard')
    .slice(0, n)
    .map((s) => s.id);
}

/** Collects seat events for a session emitted during `fn`. */
function capture(sessionId, fn) {
  const events = [];
  const listener = (payload) => {
    if (payload.sessionId === sessionId) events.push(...payload.changes);
  };
  seatEvents.on('seats', listener);
  fn();
  seatEvents.off('seats', listener);
  return events;
}

describe('seat events (bus)', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now: NOW });
  });
  afterEach(() => db.close());

  it('emits held on create, sold on pay, free on refund', () => {
    const session = futureSession(db);
    const seatIds = freeSeats(db, session.id, 2);

    let orderId;
    const held = capture(session.id, () => {
      orderId = createOrder(
        db,
        { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
        NOW,
      ).orderId;
    });
    expect(held.every((c) => c.status === 'held')).toBe(true);
    expect(held.map((c) => c.seatId).sort()).toEqual([...seatIds].sort());

    const sold = capture(session.id, () =>
      payOrder(db, orderId, { cardNumber: '4111111111111111' }, NOW),
    );
    expect(sold.every((c) => c.status === 'sold')).toBe(true);

    const freed = capture(session.id, () => refundOrder(db, orderId, NOW));
    expect(freed.every((c) => c.status === 'free')).toBe(true);
  });

  it('emits free on a declined payment', () => {
    const session = futureSession(db);
    const seatIds = freeSeats(db, session.id, 1);
    const orderId = createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    ).orderId;
    const freed = capture(session.id, () => {
      try {
        payOrder(db, orderId, { cardNumber: '4000000000000000' }, NOW);
      } catch {
        /* declined */
      }
    });
    expect(freed.map((c) => c.status)).toContain('free');
  });

  it('emits free when an expired hold is released', () => {
    const session = futureSession(db);
    const seatIds = freeSeats(db, session.id, 1);
    createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    const later = new Date(NOW.getTime() + 11 * 60 * 1000);
    const freed = capture(session.id, () => releaseExpiredOrders(db, later));
    expect(freed).toEqual([{ seatId: seatIds[0], status: 'free' }]);
  });
});

describe('Socket.IO delivery', () => {
  let db;
  let httpServer;
  let realtime;
  let url;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now: NOW });
    httpServer = createServer();
    realtime = attachRealtime(httpServer, { config: testConfig });
    await new Promise((resolve) => httpServer.listen(0, resolve));
    url = `http://localhost:${httpServer.address().port}`;
  });

  afterEach(async () => {
    await realtime.close();
    httpServer.close();
    db.close();
  });

  it('delivers seats:update to a client in the session room', async () => {
    const session = futureSession(db);
    const seatIds = freeSeats(db, session.id, 1);
    const client = ioClient(url, { path: '/socket.io', transports: ['websocket'] });

    const received = new Promise((resolve) => {
      client.on('seats:update', resolve);
    });
    await new Promise((resolve) => client.on('connect', resolve));
    client.emit('session:join', session.id);
    // Give the join a tick to register before we emit.
    await new Promise((r) => setTimeout(r, 50));

    createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );

    const payload = await received;
    expect(payload.sessionId).toBe(session.id);
    expect(payload.changes[0]).toMatchObject({ seatId: seatIds[0], status: 'held' });
    client.close();
  });

  it('does not deliver events for a session the client has not joined', async () => {
    const session = futureSession(db);
    const seatIds = freeSeats(db, session.id, 1);
    const client = ioClient(url, { path: '/socket.io', transports: ['websocket'] });
    await new Promise((resolve) => client.on('connect', resolve));
    // Join a different, non-existent room.
    client.emit('session:join', 999999);
    await new Promise((r) => setTimeout(r, 50));

    let got = false;
    client.on('seats:update', () => {
      got = true;
    });
    createOrder(
      db,
      { sessionId: session.id, seatIds, email: 'a@b.co', firstName: 'A', lastName: 'B' },
      NOW,
    );
    await new Promise((r) => setTimeout(r, 150));
    expect(got).toBe(false);
    client.close();
  });
});
