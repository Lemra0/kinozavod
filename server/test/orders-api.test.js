import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import { getSeatMap } from '../src/modules/seatmap.js';
import { buildDemoIsikukood } from '../src/modules/isikukood.js';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

const NOW_ISO = new Date(Date.now() + 3 * 3600 * 1000).toISOString();

describe('orders API', () => {
  let db;
  let app;
  const sent = [];

  beforeAll(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    const mailer = { send: async (order, kind) => sent.push({ order: order.id, kind }) };
    app = createApp({ db, config: testConfig, mailer });
  });

  afterAll(() => db.close());

  function anySession(restricted = false) {
    const clause = restricted
      ? "m.age_rating_ee IN ('K-12','K-14','K-16')"
      : "(m.age_rating_ee IS NULL OR m.age_rating_ee NOT IN ('K-12','K-14','K-16'))";
    return db
      .prepare(
        `SELECT s.id FROM sessions s JOIN movies m ON m.id = s.movie_id
         WHERE ${clause} AND s.start_time > ? ORDER BY s.start_time LIMIT 1`,
      )
      .pluck()
      .get(NOW_ISO);
  }

  function freeSeats(sessionId, count) {
    return getSeatMap(db, sessionId)
      .seats.filter((s) => s.status === 'free' && s.type === 'standard')
      .slice(0, count)
      .map((s) => s.id);
  }

  it('GET seat map', async () => {
    const sessionId = anySession();
    const res = await request(app).get(`/api/sessions/${sessionId}/seats`);
    expect(res.status).toBe(200);
    expect(res.body.seats.length).toBeGreaterThan(0);
    expect(res.body.seats[0]).toHaveProperty('price');
  });

  it('suggests best seats', async () => {
    const sessionId = anySession();
    const res = await request(app).get(`/api/sessions/${sessionId}/best-seats?count=3`);
    expect(res.status).toBe(200);
    expect(res.body.suggestions[0].length).toBeGreaterThan(0);
  });

  it('full purchase flow: create → pay → view with QR → refund', async () => {
    const sessionId = anySession();
    const seatIds = freeSeats(sessionId, 2);

    const create = await request(app).post('/api/orders').send({
      sessionId,
      seatIds,
      email: 'buyer@test.co',
      firstName: 'Buy',
      lastName: 'Er',
      locale: 'ru',
    });
    expect(create.status).toBe(201);
    const { orderId, token } = create.body;
    expect(token).toBeTruthy();

    const pay = await request(app)
      .post(`/api/orders/${orderId}/pay?token=${token}`)
      .send({ cardNumber: '4111111111111111' });
    expect(pay.status).toBe(200);
    expect(sent.some((m) => m.order === orderId && m.kind === 'ticket')).toBe(true);

    const view = await request(app).get(`/api/orders/${orderId}?token=${token}&lang=ru`);
    expect(view.status).toBe(200);
    expect(view.body.status).toBe('paid');
    expect(view.body.tickets[0].qr).toContain('<svg');
    expect(view.body.calendar.google).toContain('calendar.google.com');
    expect(view.body.canRefund).toBe(true);

    const refund = await request(app).post(`/api/orders/${orderId}/refund?token=${token}`);
    expect(refund.status).toBe(200);
  });

  it('rejects viewing an order without the token', async () => {
    const sessionId = anySession();
    const seatIds = freeSeats(sessionId, 1);
    const create = await request(app)
      .post('/api/orders')
      .send({ sessionId, seatIds, email: 'a@test.co', firstName: 'A', lastName: 'B' });
    const res = await request(app).get(`/api/orders/${create.body.orderId}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('declined card returns 402', async () => {
    const sessionId = anySession();
    const seatIds = freeSeats(sessionId, 1);
    const create = await request(app)
      .post('/api/orders')
      .send({ sessionId, seatIds, email: 'a@test.co', firstName: 'A', lastName: 'B' });
    const pay = await request(app)
      .post(`/api/orders/${create.body.orderId}/pay`)
      .send({ cardNumber: '4000000000000000' });
    expect(pay.status).toBe(402);
    expect(pay.body.error.code).toBe('PAYMENT_DECLINED');
  });

  it('serves an .ics file', async () => {
    const sessionId = anySession();
    const seatIds = freeSeats(sessionId, 1);
    const create = await request(app)
      .post('/api/orders')
      .send({ sessionId, seatIds, email: 'a@test.co', firstName: 'A', lastName: 'B' });
    const res = await request(app).get(
      `/api/orders/${create.body.orderId}/calendar.ics?token=${create.body.token}`,
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/calendar/);
    expect(res.text).toContain('BEGIN:VEVENT');
    expect(res.text).toContain('TRIGGER:-PT1H');
  });

  it('age check by isikukood: adult passes, child fails', async () => {
    const sessionId = anySession(true);
    if (!sessionId) return; // no restricted movie in demo set edge case
    const adult = await request(app)
      .post('/api/age-check/demo')
      .send({ sessionId, isikukood: buildDemoIsikukood('1990-05-05') });
    expect(adult.body.passes).toBe(true);
    const child = await request(app)
      .post('/api/age-check/demo')
      .send({ sessionId, isikukood: buildDemoIsikukood('2018-05-05') });
    expect(child.body.passes).toBe(false);
  });

  it('buys a restricted film with a valid isikukood', async () => {
    const sessionId = anySession(true);
    if (!sessionId) return;
    const seatIds = freeSeats(sessionId, 1);
    const res = await request(app)
      .post('/api/orders')
      .send({
        sessionId,
        seatIds,
        email: 'a@test.co',
        firstName: 'A',
        lastName: 'B',
        isikukood: buildDemoIsikukood('1990-05-05'),
      });
    expect(res.status).toBe(201);
  });

  it('blocks a restricted film without isikukood', async () => {
    const sessionId = anySession(true);
    if (!sessionId) return;
    const seatIds = freeSeats(sessionId, 1);
    const res = await request(app)
      .post('/api/orders')
      .send({ sessionId, seatIds, email: 'a@test.co', firstName: 'A', lastName: 'B' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('AGE_CHECK_REQUIRED');
  });

  it('validates the request body', async () => {
    const res = await request(app)
      .post('/api/orders')
      .send({ sessionId: 1, seatIds: [], email: 'x' });
    expect(res.status).toBe(400);
  });
});
