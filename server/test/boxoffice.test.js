import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import { getSeatMap } from '../src/modules/seatmap.js';
import {
  lookupTicket,
  sellAtBoxOffice,
  shiftSummary,
  todaySessions,
  useTicket,
} from '../src/modules/boxoffice.js';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

function expectCode(fn, code) {
  try {
    fn();
  } catch (error) {
    expect(error.code).toBe(code);
    return;
  }
  throw new Error(`Expected error ${code} but none was thrown`);
}
// A fixed morning "now" so that "today" always has sellable sessions,
// regardless of the wall-clock time the test suite runs at.
const NOW = new Date();
NOW.setUTCHours(6, 0, 0, 0); // 06:00Z — well before the last screening of the day
function futureTodaySession(db) {
  const list = todaySessions(db, { now: NOW });
  return list.find((s) => s.seatsFree > 0) ?? list[0];
}
function freeSeats(db, sessionId, n, type = 'standard') {
  return getSeatMap(db, sessionId)
    .seats.filter((s) => s.status === 'free' && s.type === type)
    .slice(0, n)
    .map((s) => s.id);
}
function makeCashier(db, role = 'cashier') {
  return db
    .prepare(
      `INSERT INTO users (email, password_hash, nickname, first_name, last_name, birth_date, role)
       VALUES (?, 'x', ?, 'C', 'R', '1990-01-01', ?)`,
    )
    .run(`${role}@kz.ee`, role, role).lastInsertRowid;
}

describe('box office module', () => {
  let db;
  let cashierId;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now: NOW });
    cashierId = makeCashier(db);
  });
  afterEach(() => db.close());

  it('sells seats for cash as a paid order with valid tickets', () => {
    const session = futureTodaySession(db);
    const seatIds = freeSeats(db, session.id, 2);
    const { orderId, total } = sellAtBoxOffice(
      db,
      {
        sessionId: session.id,
        seatIds,
        method: 'cash',
        cashierId,
      },
      NOW,
    );
    expect(total).toBeGreaterThan(0);
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(order.channel).toBe('box_office');
    expect(order.status).toBe('paid');
    expect(order.cashier_id).toBe(cashierId);
    const tickets = db.prepare('SELECT status FROM tickets WHERE order_id = ?').all(orderId);
    expect(tickets.every((t) => t.status === 'valid')).toBe(true);
    const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
    expect(payment.method).toBe('cash');
    expect(payment.status).toBe('success');
  });

  it('prevents selling a seat that is already taken', () => {
    const session = futureTodaySession(db);
    const [seat] = freeSeats(db, session.id, 1);
    sellAtBoxOffice(db, { sessionId: session.id, seatIds: [seat], method: 'cash', cashierId }, NOW);
    expectCode(
      () =>
        sellAtBoxOffice(
          db,
          { sessionId: session.id, seatIds: [seat], method: 'cash', cashierId },
          NOW,
        ),
      'SEAT_TAKEN',
    );
  });

  it('rejects an unknown payment method', () => {
    const session = futureTodaySession(db);
    const [seat] = freeSeats(db, session.id, 1);
    expectCode(
      () =>
        sellAtBoxOffice(db, {
          sessionId: session.id,
          seatIds: [seat],
          method: 'bitcoin',
          cashierId,
        }),
      'BAD_METHOD',
    );
  });

  it('looks up and admits a ticket, then reports it used', () => {
    const session = futureTodaySession(db);
    const [seat] = freeSeats(db, session.id, 1);
    const { orderId } = sellAtBoxOffice(
      db,
      {
        sessionId: session.id,
        seatIds: [seat],
        method: 'cash',
        cashierId,
      },
      NOW,
    );
    const code = db.prepare('SELECT code FROM tickets WHERE order_id = ?').pluck().get(orderId);

    // Check-in opens 1h before start; pretend we are 30 min before.
    const near = new Date(new Date(session.startTime).getTime() - 30 * 60 * 1000);
    const before = lookupTicket(db, code);
    expect(before.verdict).toBe('valid');

    const admitted = useTicket(db, code, { cashierId, now: near });
    expect(admitted.verdict).toBe('admitted');

    const after = lookupTicket(db, code);
    expect(after.verdict).toBe('used');
    expect(after.ticket.usedAt).toBeTruthy();

    // Second scan is rejected.
    expectCode(() => useTicket(db, code, { cashierId, now: near }), 'ALREADY_USED');
  });

  it('does not admit before check-in opens', () => {
    const session = futureTodaySession(db);
    const [seat] = freeSeats(db, session.id, 1);
    const { orderId } = sellAtBoxOffice(
      db,
      {
        sessionId: session.id,
        seatIds: [seat],
        method: 'cash',
        cashierId,
      },
      NOW,
    );
    const code = db.prepare('SELECT code FROM tickets WHERE order_id = ?').pluck().get(orderId);
    const tooEarly = new Date(new Date(session.startTime).getTime() - 3 * 60 * 60 * 1000);
    expectCode(() => useTicket(db, code, { cashierId, now: tooEarly }), 'CHECKIN_NOT_OPEN');
  });

  it('reports not found / refunded verdicts', () => {
    expect(lookupTicket(db, 'KZ-ZZZZ-ZZZZ').verdict).toBe('not_found');
  });

  it('summarises the shift by method', () => {
    const session = futureTodaySession(db);
    sellAtBoxOffice(
      db,
      { sessionId: session.id, seatIds: freeSeats(db, session.id, 2), method: 'cash', cashierId },
      NOW,
    );
    sellAtBoxOffice(
      db,
      {
        sessionId: session.id,
        seatIds: freeSeats(db, session.id, 1, 'vip'),
        method: 'card_terminal',
        cashierId,
      },
      NOW,
    );
    const summary = shiftSummary(db, { now: NOW });
    expect(summary.ticketsSold).toBe(3);
    expect(summary.byMethod.cash.sold).toBeGreaterThan(0);
    expect(summary.byMethod.card_terminal.sold).toBeGreaterThan(0);
    expect(summary.net).toBe(summary.totalSold - summary.totalRefunded);
  });
});

describe('staff API access control', () => {
  let db;
  let app;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
  });
  afterEach(() => db.close());

  async function sessionCookie(role) {
    // register a normal user, then elevate its role directly for the test
    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: `${role}@kz.ee`,
        password: 'supersecret',
        nickname: role + 'user',
        firstName: 'C',
        lastName: 'R',
        birthDate: '1990-01-01',
      });
    if (role !== 'user') {
      db.prepare('UPDATE users SET role = ? WHERE email = ?').run(role, `${role}@kz.ee`);
    }
    return (reg.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  }

  it('blocks anonymous and normal users from staff endpoints', async () => {
    expect((await request(app).get('/api/staff/sessions')).status).toBe(401);
    const userCookie = await sessionCookie('user');
    const res = await request(app).get('/api/staff/sessions').set('Cookie', userCookie);
    expect(res.status).toBe(403);
  });

  it('allows a cashier to list today sessions', async () => {
    const cookie = await sessionCookie('cashier');
    const res = await request(app).get('/api/staff/sessions').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.sessions)).toBe(true);
  });
});
