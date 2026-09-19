import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import { getSeatMap } from '../src/modules/seatmap.js';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

const NOW_FUTURE = new Date(Date.now() + 3 * 3600 * 1000).toISOString();

// Extracts a cookie value from a set-cookie array.
function cookieValue(res, name) {
  const cookies = res.headers['set-cookie'] ?? [];
  const line = cookies.find((c) => c.startsWith(`${name}=`));
  return line ? line.split(';')[0].split('=')[1] : null;
}

function cookieHeader(res) {
  return (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
}

const REGISTER = {
  email: 'lemon@test.ee',
  password: 'supersecret',
  nickname: 'lemon',
  firstName: 'Lemon',
  lastName: 'Test',
  birthDate: '1998-04-10',
};

describe('auth API', () => {
  let db;
  let app;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
  });

  afterEach(() => db.close());

  it('registers a user and sets a session cookie', async () => {
    const res = await request(app).post('/api/auth/register').send(REGISTER);
    expect(res.status).toBe(201);
    expect(res.body.user.nickname).toBe('lemon');
    expect(cookieValue(res, 'kz_session')).toBeTruthy();
    expect(cookieValue(res, 'kz_csrf')).toBeTruthy();
  });

  it('rejects registration under 13', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...REGISTER, birthDate: '2020-01-01' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TOO_YOUNG');
  });

  it('rejects duplicate email and nickname', async () => {
    await request(app).post('/api/auth/register').send(REGISTER);
    const dupEmail = await request(app)
      .post('/api/auth/register')
      .send({ ...REGISTER, nickname: 'other' });
    expect(dupEmail.body.error.code).toBe('EMAIL_TAKEN');
    const dupNick = await request(app)
      .post('/api/auth/register')
      .send({ ...REGISTER, email: 'x@test.ee' });
    expect(dupNick.body.error.code).toBe('NICKNAME_TAKEN');
  });

  it('rejects an offensive nickname', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ ...REGISTER, nickname: 'nazi' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('NICKNAME_NOT_ALLOWED');
  });

  it('logs in and returns the user, then logs out', async () => {
    await request(app).post('/api/auth/register').send(REGISTER);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: REGISTER.email, password: REGISTER.password });
    expect(login.status).toBe(200);
    const cookies = cookieHeader(login);
    const me = await request(app).get('/api/me').set('Cookie', cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(REGISTER.email);
  });

  it('rejects wrong password', async () => {
    await request(app).post('/api/auth/register').send(REGISTER);
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: REGISTER.email, password: 'wrong' });
    expect(res.status).toBe(401);
  });

  it('blocks /api/me without a session', async () => {
    const res = await request(app).get('/api/me');
    expect(res.status).toBe(401);
  });

  it('enforces CSRF on unsafe requests when signed in', async () => {
    const reg = await request(app).post('/api/auth/register').send(REGISTER);
    const cookies = cookieHeader(reg);
    // PATCH without the CSRF header must fail
    const noCsrf = await request(app)
      .patch('/api/me')
      .set('Cookie', cookies)
      .send({ firstName: 'X' });
    expect(noCsrf.status).toBe(403);
    expect(noCsrf.body.error.code).toBe('CSRF');
    // With the header it works
    const csrf = cookieValue(reg, 'kz_csrf');
    const ok = await request(app)
      .patch('/api/me')
      .set('Cookie', cookies)
      .set('X-CSRF-Token', csrf)
      .send({ firstName: 'Changed' });
    expect(ok.status).toBe(200);
    expect(ok.body.user.firstName).toBe('Changed');
  });

  it('checks nickname availability', async () => {
    await request(app).post('/api/auth/register').send(REGISTER);
    expect(
      (await request(app).get('/api/auth/nickname-available?nickname=lemon')).body.available,
    ).toBe(false);
    expect(
      (await request(app).get('/api/auth/nickname-available?nickname=freename')).body.available,
    ).toBe(true);
    expect(
      (await request(app).get('/api/auth/nickname-available?nickname=nazi')).body.available,
    ).toBe(false);
  });

  it('attaches guest orders on registration', async () => {
    // Guest buys with the email that will be registered.
    const sessionId = db
      .prepare(
        `SELECT s.id FROM sessions s JOIN movies m ON m.id=s.movie_id
         WHERE (m.age_rating_ee IS NULL OR m.age_rating_ee NOT IN ('K-12','K-14','K-16'))
           AND s.start_time > ? ORDER BY s.start_time LIMIT 1`,
      )
      .pluck()
      .get(NOW_FUTURE);
    const seat = getSeatMap(db, sessionId).seats.find((s) => s.status === 'free').id;
    await request(app)
      .post('/api/orders')
      .send({
        sessionId,
        seatIds: [seat],
        email: REGISTER.email,
        firstName: 'G',
        lastName: 'Uest',
      });

    const reg = await request(app).post('/api/auth/register').send(REGISTER);
    const cookies = cookieHeader(reg);
    const orders = await request(app).get('/api/me/orders').set('Cookie', cookies);
    expect(orders.body.orders.length).toBe(1);
  });
});
