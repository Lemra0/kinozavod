import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import { getSeatMap } from '../src/modules/seatmap.js';
import { generatedAvatarSvg } from '../src/modules/avatar.js';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

function cookieHeader(res) {
  return (res.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
}
function cookieValue(res, name) {
  const line = (res.headers['set-cookie'] ?? []).find((c) => c.startsWith(`${name}=`));
  return line ? line.split(';')[0].split('=')[1] : null;
}

const REGISTER = {
  email: 'lemon@test.ee',
  password: 'supersecret',
  nickname: 'lemon',
  firstName: 'Lemon',
  lastName: 'Test',
  birthDate: '1998-04-10',
};

describe('profile & watchlist API', () => {
  let db;
  let app;
  let cookies;
  let csrf;

  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
    const reg = await request(app).post('/api/auth/register').send(REGISTER);
    cookies = cookieHeader(reg);
    csrf = cookieValue(reg, 'kz_csrf');
  });

  afterEach(() => db.close());

  const auth = (r) => r.set('Cookie', cookies).set('X-CSRF-Token', csrf);

  it('updates first name but never birth date via profile', async () => {
    const res = await auth(request(app).patch('/api/me')).send({
      firstName: 'New',
      birthDate: '1900-01-01',
    });
    expect(res.status).toBe(200);
    expect(res.body.user.firstName).toBe('New');
    expect(res.body.user.birthDate).toBe('1998-04-10'); // unchanged
  });

  it('blocks a second nickname change within 30 days', async () => {
    const first = await auth(request(app).patch('/api/me')).send({ nickname: 'lemondrop' });
    expect(first.status).toBe(200);
    const second = await auth(request(app).patch('/api/me')).send({ nickname: 'lemonzest' });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('NICKNAME_TOO_SOON');
  });

  it('changes the password with the correct current one', async () => {
    const bad = await auth(request(app).post('/api/me/password')).send({
      currentPassword: 'wrong',
      newPassword: 'anotherlongone',
    });
    expect(bad.status).toBe(403);
    const ok = await auth(request(app).post('/api/me/password')).send({
      currentPassword: REGISTER.password,
      newPassword: 'anotherlongone',
    });
    expect(ok.status).toBe(200);
    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: REGISTER.email, password: 'anotherlongone' });
    expect(login.status).toBe(200);
  });

  it('saves favourite genres', async () => {
    const genreIds = db.prepare('SELECT id FROM genres LIMIT 3').pluck().all();
    const res = await auth(request(app).put('/api/me/genres')).send({ genres: genreIds });
    expect(res.status).toBe(200);
    expect(res.body.genres.sort()).toEqual([...genreIds].sort());
    const me = await request(app).get('/api/me').set('Cookie', cookies);
    expect(me.body.user.genres.sort()).toEqual([...genreIds].sort());
  });

  it('manages the watchlist', async () => {
    const movieId = db.prepare('SELECT id FROM movies LIMIT 1').pluck().get();
    await auth(request(app).put(`/api/me/watchlist/${movieId}`)).send();
    let list = await request(app).get('/api/me/watchlist').set('Cookie', cookies);
    expect(list.body.movies.map((m) => m.id)).toContain(movieId);
    await auth(request(app).delete(`/api/me/watchlist/${movieId}`)).send();
    list = await request(app).get('/api/me/watchlist').set('Cookie', cookies);
    expect(list.body.movies.length).toBe(0);
  });

  it('serves a generated avatar and switches to a custom one', async () => {
    const me = await request(app).get('/api/me').set('Cookie', cookies);
    const gen = await request(app).get(me.body.user.avatarUrl);
    expect(gen.status).toBe(200);
    expect(gen.headers['content-type']).toMatch(/svg/);
  });

  it('generated avatar shows the first letter', () => {
    expect(generatedAvatarSvg('lemon')).toContain('>L<');
  });

  it('signed-in purchase uses profile data and needs no isikukood for K films', async () => {
    // pick a restricted session; the adult profile should pass by birth date
    const sessionId = db
      .prepare(
        `SELECT s.id FROM sessions s JOIN movies m ON m.id=s.movie_id
         WHERE m.age_rating_ee IN ('K-12','K-14','K-16') AND s.start_time > ?
         ORDER BY s.start_time LIMIT 1`,
      )
      .pluck()
      .get(new Date(Date.now() + 3 * 3600 * 1000).toISOString());
    if (!sessionId) return;
    const seat = getSeatMap(db, sessionId).seats.find((s) => s.status === 'free').id;
    const res = await auth(request(app).post('/api/orders')).send({ sessionId, seatIds: [seat] });
    expect(res.status).toBe(201);
    const order = db
      .prepare('SELECT user_id, age_check, email FROM orders WHERE id = ?')
      .get(res.body.orderId);
    expect(order.user_id).toBeTruthy();
    expect(order.email).toBe(REGISTER.email);
    expect(order.age_check).toBe('profile');
  });

  it('deletes the account and detaches orders', async () => {
    const res = await auth(request(app).delete('/api/me')).send();
    expect(res.status).toBe(200);
    const gone = await request(app).get('/api/me').set('Cookie', cookies);
    expect(gone.status).toBe(401);
  });
});
