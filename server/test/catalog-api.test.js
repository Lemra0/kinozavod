import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { CINEMA, localDate } from '@kinozavod/shared';
import { createApp } from '../src/app.js';
import { seedCatalog } from '../src/modules/catalog.js';
import { createTestDb, testConfig } from './helpers.js';

describe('catalog API', () => {
  let db;
  let app;
  let today;

  beforeAll(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
    today = localDate(new Date(), CINEMA.timezone);
  });

  afterAll(() => db.close());

  it('GET /api/schedule returns today with seven days and movies', async () => {
    const res = await request(app).get('/api/schedule?lang=ru');
    expect(res.status).toBe(200);
    expect(res.body.date).toBe(today);
    expect(res.body.days).toHaveLength(7);
    expect(res.body.movies.length).toBeGreaterThan(0);
    const session = res.body.movies[0].sessions[0];
    expect(session).toHaveProperty('priceFrom');
    expect(session.seatsFree).toBe(session.seatsTotal);
    expect(res.body.soon.length).toBeGreaterThan(0);
    expect(res.body.soon[0].title).toMatch(/[А-Яа-я]/);
  });

  it('filters the schedule by hall and format', async () => {
    const res = await request(app).get(`/api/schedule?date=${res0()}&hall=p3`);
    expect(res.status).toBe(200);
    for (const movie of res.body.movies) {
      for (const s of movie.sessions) expect(s.hall.code).toBe('p3');
    }
    const res3d = await request(app).get('/api/schedule?format=3D');
    for (const movie of res3d.body.movies) {
      for (const s of movie.sessions) expect(s.format).toBe('3D');
    }
  });

  it('rejects dates outside the week', async () => {
    const res = await request(app).get('/api/schedule?date=2020-01-01');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('DATE_OUT_OF_RANGE');
  });

  it('GET /api/movies/:id returns the movie with upcoming sessions', async () => {
    const list = await request(app).get('/api/movies?lang=et');
    const id = list.body.movies[0].id;
    const res = await request(app).get(`/api/movies/${id}?lang=et`);
    expect(res.status).toBe(200);
    expect(res.body.movie.id).toBe(id);
    expect(res.body.movie.genres.length).toBeGreaterThan(0);
    expect(res.body.sessions.every((s) => s.past === false)).toBe(true);
  });

  it('returns 404 for unknown movies', async () => {
    expect((await request(app).get('/api/movies/99999')).status).toBe(404);
    expect((await request(app).get('/api/movies/abc')).status).toBe(404);
  });

  it('lists upcoming movies', async () => {
    const res = await request(app).get('/api/movies?status=soon');
    expect(res.body.movies.map((m) => m.originalTitle)).toEqual(['Cold Harbour', 'Orbit Café']);
  });

  it('suggests movies while typing', async () => {
    const res = await request(app).get('/api/search/suggest?q=ночн&lang=ru');
    expect(res.body.movies).toHaveLength(1);
    expect(res.body.movies[0].title).toBe('Ночная смена');
    expect(res.body.movies[0].nextSession).not.toBeNull();
    expect((await request(app).get('/api/search/suggest?q=a')).body.movies).toEqual([]);
  });

  it('serves demo posters and hall info', async () => {
    const poster = await request(app).get('/api/posters/demo/static.svg');
    expect(poster.status).toBe(200);
    expect(poster.headers['content-type']).toMatch(/svg/);
    const halls = await request(app).get('/api/halls');
    expect(halls.body.halls.map((h) => h.code)).toEqual(['p1', 'p2', 'p3']);
  });

  function res0() {
    return today;
  }
});
