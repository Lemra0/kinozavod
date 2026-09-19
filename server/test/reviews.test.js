import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import {
  createReview,
  listReviews,
  ratingSummary,
  shouldMaskProfanity,
  watchedAtCinema,
} from '../src/modules/reviews.js';
import { addWordFilter } from '../src/modules/adminWordFilter.js';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

function expectCode(fn, code) {
  try {
    fn();
  } catch (e) {
    expect(e.code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}
function makeUser(db, { nickname = 'u', birth = '1990-01-01', showProfanity = 0 } = {}) {
  return db
    .prepare(
      `INSERT INTO users (email, password_hash, nickname, first_name, last_name, birth_date, show_profanity)
       VALUES (?, 'x', ?, 'F', 'L', ?, ?)`,
    )
    .run(`${nickname}@kz.ee`, nickname, birth, showProfanity).lastInsertRowid;
}
const movieId = (db) =>
  db.prepare('SELECT id FROM movies WHERE is_archived=0 LIMIT 1').pluck().get();

describe('reviews module', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
  });
  afterEach(() => db.close());

  it('creates a review and computes the average', () => {
    const mid = movieId(db);
    createReview(db, {
      userId: makeUser(db, { nickname: 'a' }),
      movieId: mid,
      rating: 8,
      text: 'good',
    });
    createReview(db, {
      userId: makeUser(db, { nickname: 'b' }),
      movieId: mid,
      rating: 6,
      text: '',
    });
    const s = ratingSummary(db, mid);
    expect(s.count).toBe(2);
    expect(s.average).toBe(7);
  });

  it('allows only one review per user per film', () => {
    const mid = movieId(db);
    const uid = makeUser(db);
    createReview(db, { userId: uid, movieId: mid, rating: 5, text: 'a' });
    expectCode(
      () => createReview(db, { userId: uid, movieId: mid, rating: 5, text: 'b' }),
      'ALREADY_REVIEWED',
    );
  });

  it('blocks publishing a review with a hate word', () => {
    addWordFilter(db, { locale: 'en', list: 'hate', pattern: 'slur' }, null);
    const mid = movieId(db);
    expectCode(
      () => createReview(db, { userId: makeUser(db), movieId: mid, rating: 5, text: 'you slur' }),
      'REVIEW_OFFENSIVE',
    );
  });

  it('masks profanity for a filtered viewer but not for one who disabled it', () => {
    addWordFilter(db, { locale: 'en', list: 'profanity', pattern: 'crap' }, null);
    const mid = movieId(db);
    createReview(db, {
      userId: makeUser(db, { nickname: 'w' }),
      movieId: mid,
      rating: 5,
      text: 'total crap',
    });

    const filteredViewer = { id: 999, birth_date: '1990-01-01', show_profanity: 0 };
    const openViewer = { id: 998, birth_date: '1990-01-01', show_profanity: 1 };
    const masked = listReviews(db, mid, { viewer: filteredViewer })[0].segments;
    const open = listReviews(db, mid, { viewer: openViewer })[0].segments;
    expect(masked.some((s) => s.masked)).toBe(true);
    expect(open.every((s) => !s.masked)).toBe(true);
  });

  it('always masks for guests and under-18 users', () => {
    const now = new Date();
    expect(shouldMaskProfanity(db, null, now)).toBe(true);
    const minor = { id: 1, birth_date: '2015-01-01', show_profanity: 1 };
    expect(shouldMaskProfanity(db, minor, now)).toBe(true);
    const adult = { id: 2, birth_date: '1990-01-01', show_profanity: 1 };
    expect(shouldMaskProfanity(db, adult, now)).toBe(false);
  });

  it('detects watched-at-cinema from a past used ticket', () => {
    const mid = movieId(db);
    const uid = makeUser(db, { nickname: 'watcher' });
    // create a past session + paid order + used ticket for this movie
    const hallId = db.prepare("SELECT id FROM halls WHERE code='p3'").pluck().get();
    const seat = db.prepare('SELECT id FROM seats WHERE hall_id = ? LIMIT 1').pluck().get(hallId);
    const sid = db
      .prepare(
        "INSERT INTO sessions (movie_id,hall_id,start_time,end_time,format,language) VALUES (?,?,?,?,?,'en')",
      )
      .run(
        mid,
        hallId,
        '2020-01-01T10:00:00.000Z',
        '2020-01-01T12:00:00.000Z',
        '2D',
      ).lastInsertRowid;
    const oid = db
      .prepare(
        "INSERT INTO orders (user_id,email,session_id,channel,status,total) VALUES (?,?,?,'online','paid',800)",
      )
      .run(uid, 'watcher@kz.ee', sid).lastInsertRowid;
    db.prepare(
      "INSERT INTO tickets (order_id,session_id,seat_id,price,code,status) VALUES (?,?,?,800,'C1','used')",
    ).run(oid, sid, seat);
    expect(watchedAtCinema(db, uid, mid)).toBe(true);
  });
});

describe('reviews API', () => {
  let db;
  let app;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
  });
  afterEach(() => db.close());

  async function register(nick) {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: `${nick}@kz.ee`,
        password: 'supersecret',
        nickname: nick,
        firstName: 'F',
        lastName: 'L',
        birthDate: '1990-01-01',
      });
    return {
      cookie: (reg.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; '),
      csrf: (reg.headers['set-cookie'] ?? [])
        .find((c) => c.startsWith('kz_csrf'))
        .split(';')[0]
        .split('=')[1],
    };
  }

  it('requires auth to post a review', async () => {
    const mid = movieId(db);
    const res = await request(app)
      .post(`/api/movies/${mid}/reviews`)
      .send({ rating: 5, text: 'x' });
    expect(res.status).toBe(401);
  });

  it('full flow: create, list, edit, delete', async () => {
    const mid = movieId(db);
    const { cookie, csrf } = await register('critic');
    const auth = (r) => r.set('Cookie', cookie).set('X-CSRF-Token', csrf);

    const create = await auth(request(app).post(`/api/movies/${mid}/reviews`)).send({
      rating: 9,
      text: 'loved it',
    });
    expect(create.status).toBe(201);

    const list = await request(app).get(`/api/movies/${mid}/reviews`).set('Cookie', cookie);
    expect(list.body.reviews.length).toBe(1);
    expect(list.body.reviews[0].author.nickname).toBe('critic');
    expect(list.body.mine.rating).toBe(9);

    const edit = await auth(request(app).patch(`/api/reviews/${create.body.id}`)).send({
      rating: 7,
      text: 'ok',
    });
    expect(edit.status).toBe(200);

    const del = await auth(request(app).delete(`/api/reviews/${create.body.id}`)).send();
    expect(del.status).toBe(200);
    const after = await request(app).get(`/api/movies/${mid}/reviews`);
    expect(after.body.reviews.length).toBe(0);
  });

  it('returns segments, never raw offensive text, to a filtered viewer', async () => {
    const mid = movieId(db);
    // add profanity word via a quick admin
    db.prepare(
      "INSERT INTO word_filter (locale,list,pattern,match_type) VALUES ('en','profanity','crap','root')",
    ).run();
    const { cookie, csrf } = await register('writer');
    await request(app)
      .post(`/api/movies/${mid}/reviews`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', csrf)
      .send({ rating: 3, text: 'what crap' });
    const guest = await request(app).get(`/api/movies/${mid}/reviews`);
    const segs = guest.body.reviews[0].segments;
    const raw = JSON.stringify(segs);
    expect(raw).not.toContain('crap');
    expect(segs.some((s) => s.masked)).toBe(true);
  });
});
