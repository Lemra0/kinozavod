import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { CINEMA, localDate, weekdayOf } from '@kinozavod/shared';
import { createApp } from '../src/app.js';
import { seedCatalog } from '../src/modules/catalog.js';
import { resolveDateRange, searchSessions } from '../src/modules/searchSessions.js';
import { createTestDb, testConfig } from './helpers.js';

const TZ = CINEMA.timezone;

describe('resolveDateRange', () => {
  const today = '2026-09-16'; // Wednesday

  it('handles today and tomorrow', () => {
    expect(resolveDateRange({ period: 'today' }, today)).toMatchObject({
      fromDate: '2026-09-16',
      toDate: '2026-09-16',
    });
    expect(resolveDateRange({ period: 'tomorrow' }, today)).toMatchObject({
      fromDate: '2026-09-17',
      toDate: '2026-09-17',
    });
  });

  it('week covers seven days', () => {
    expect(resolveDateRange({ period: 'week' }, today)).toMatchObject({
      fromDate: '2026-09-16',
      toDate: '2026-09-22',
    });
  });

  it('next-week starts on Monday', () => {
    const range = resolveDateRange({ period: 'next-week' }, today);
    expect(weekdayOf(range.fromDate)).toBe(1);
    expect(range.fromDate).toBe('2026-09-21');
  });

  it('custom range uses the given days', () => {
    expect(
      resolveDateRange({ period: 'custom', from: '2026-09-20', to: '2026-09-25' }, today),
    ).toMatchObject({ fromDate: '2026-09-20', toDate: '2026-09-25' });
  });

  it('clamps the past to today', () => {
    const range = resolveDateRange(
      { period: 'custom', from: '2020-01-01', to: '2026-09-18' },
      today,
    );
    expect(range.fromDate).toBe('2026-09-16');
  });
});

describe('searchSessions', () => {
  let db;
  const now = new Date('2026-09-16T07:00:00.000Z');

  beforeAll(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn(), now });
  });

  afterAll(() => db.close());

  const run = (filters) => searchSessions(db, { lang: 'en', ...filters }, { now });

  it('returns sessions for the whole horizon by default', () => {
    const { total, sessions } = run({});
    expect(total).toBeGreaterThan(0);
    expect(sessions.length).toBeLessThanOrEqual(20);
    expect(sessions.every((s) => !s.past)).toBe(true);
  });

  it('never returns sessions that already started', () => {
    const { sessions } = run({ period: 'today', sort: 'time' });
    expect(sessions.every((s) => new Date(s.startTime) > now)).toBe(true);
  });

  it('filters by format', () => {
    const { sessions } = run({ format: '3D' });
    expect(sessions.every((s) => s.format === '3D')).toBe(true);
  });

  it('filters by hall', () => {
    const { sessions } = run({ hall: 'p3' });
    expect(sessions.every((s) => s.hall.code === 'p3')).toBe(true);
  });

  it('filters by evening time band (local Tallinn time)', () => {
    const { sessions } = run({ timeBand: 'evening' });
    expect(sessions.every((s) => s.localTime >= '17:00' && s.localTime < '21:00')).toBe(true);
  });

  it('filters by a custom time window', () => {
    const { sessions } = run({ timeFrom: '22:00', timeTo: '23:59' });
    expect(sessions.every((s) => s.localTime >= '22:00')).toBe(true);
  });

  it('filters by weekday (weekends only)', () => {
    const { sessions } = run({ period: 'month', weekdays: [6, 7] });
    expect(sessions.every((s) => [6, 7].includes(weekdayOf(s.localDate)))).toBe(true);
  });

  it('filters family-friendly ratings', () => {
    const { sessions } = run({ age: 'family', period: 'month' });
    const ratings = db
      .prepare(
        'SELECT DISTINCT age_rating_ee FROM movies WHERE id IN (SELECT movie_id FROM sessions)',
      )
      .pluck()
      .all();
    for (const s of sessions) {
      const rating = db
        .prepare('SELECT age_rating_ee FROM movies WHERE id = ?')
        .pluck()
        .get(s.movieId);
      expect(['PERE', 'L']).toContain(rating);
    }
    expect(ratings.length).toBeGreaterThan(0);
  });

  it('excludes restricted ratings with no-restricted', () => {
    const { sessions } = run({ age: 'no-restricted', period: 'month' });
    for (const s of sessions) {
      const rating = db
        .prepare('SELECT age_rating_ee FROM movies WHERE id = ?')
        .pluck()
        .get(s.movieId);
      expect(['K-12', 'K-14', 'K-16']).not.toContain(rating);
    }
  });

  it('respects max duration', () => {
    const { sessions } = run({ maxDuration: 100, period: 'month' });
    for (const s of sessions) {
      const dur = db.prepare('SELECT duration_min FROM movies WHERE id = ?').pluck().get(s.movieId);
      expect(dur).toBeLessThanOrEqual(100);
    }
  });

  it('sorts by price ascending', () => {
    const { sessions } = run({ sort: 'price', period: 'week' });
    const prices = sessions.map((s) => s.priceFrom);
    expect([...prices]).toEqual([...prices].sort((a, b) => a - b));
  });

  it('sorts by duration ascending', () => {
    const { sessions } = run({ sort: 'duration', period: 'week' });
    const durations = sessions.map((s) =>
      db.prepare('SELECT duration_min FROM movies WHERE id = ?').pluck().get(s.movieId),
    );
    expect([...durations]).toEqual([...durations].sort((a, b) => a - b));
  });

  it('finds a movie by text query', () => {
    const rustSky = db
      .prepare("SELECT id FROM movies WHERE original_title = 'Rust Sky'")
      .pluck()
      .get();
    const { sessions } = run({ q: 'ржав', period: 'month' });
    expect(sessions.length).toBeGreaterThan(0);
    expect(sessions.every((s) => s.movieId === rustSky)).toBe(true);
  });

  it('returns nothing for a query with no matches', () => {
    expect(run({ q: 'zzzznotamovie', period: 'month' }).total).toBe(0);
  });

  it('finds N adjacent free seats', () => {
    const { sessions } = run({ together: 4, period: 'today' });
    expect(sessions.length).toBeGreaterThan(0); // fresh catalog: everything is free
  });

  it('paginates', () => {
    const first = run({ period: 'month', page: 0 });
    const second = run({ period: 'month', page: 1 });
    expect(first.sessions.length).toBe(20);
    const ids = new Set(first.sessions.map((s) => s.id));
    expect(second.sessions.every((s) => !ids.has(s.id))).toBe(true);
  });
});

describe('search API', () => {
  let db;
  let app;

  beforeAll(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
  });

  afterAll(() => db.close());

  it('GET /api/search returns movies and sessions', async () => {
    const res = await request(app).get('/api/search?period=week&lang=ru');
    expect(res.status).toBe(200);
    expect(res.body.total).toBeGreaterThan(0);
    expect(res.body.movies.length).toBeGreaterThan(0);
    expect(res.body.sessions.length).toBeGreaterThan(0);
    // every session's movie is included
    const ids = new Set(res.body.movies.map((m) => m.id));
    expect(res.body.sessions.every((s) => ids.has(s.movieId))).toBe(true);
  });

  it('GET /api/search/filters lists genres and languages', async () => {
    const res = await request(app).get('/api/search/filters?lang=et');
    expect(res.status).toBe(200);
    expect(res.body.genres.length).toBeGreaterThan(0);
    expect(res.body.genres[0]).toHaveProperty('name');
    expect(Array.isArray(res.body.languages)).toBe(true);
  });

  it('rejects an invalid sort', async () => {
    const res = await request(app).get('/api/search?sort=nonsense');
    expect(res.status).toBe(400);
  });

  it('shares state through the URL (custom range round-trips)', async () => {
    const today = localDate(new Date(), TZ);
    const res = await request(app).get(`/api/search?period=custom&from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.range.from).toBe(today);
  });
});
