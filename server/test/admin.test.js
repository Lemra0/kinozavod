import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import { getSeatMap } from '../src/modules/seatmap.js';
import { sellAtBoxOffice } from '../src/modules/boxoffice.js';
import { updatePrices } from '../src/modules/adminPrices.js';
import { bulkCreateSessions, cancelSession, createSession } from '../src/modules/adminSessions.js';
import { adminUpdateUser } from '../src/modules/adminUsers.js';
import { addWordFilter, listWordFilter } from '../src/modules/adminWordFilter.js';
import { getPriceSettings } from '../src/settings.js';
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
function ids(db) {
  const movie = db
    .prepare('SELECT id, supports_3d FROM movies WHERE is_archived=0 ORDER BY id LIMIT 1')
    .get();
  const hall2d = db.prepare("SELECT id FROM halls WHERE code='p3'").pluck().get(); // 2D only
  const hall3d = db.prepare("SELECT id FROM halls WHERE code='p1'").pluck().get(); // 2D+3D
  return { movie, hall2d, hall3d };
}

describe('admin prices', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
  });
  afterEach(() => db.close());

  it('updates prices and rejects bad values', () => {
    const updated = updatePrices(db, { seatStandard: 900, morningUntil: '11:30' });
    expect(updated.seatStandard).toBe(900);
    expect(updated.morningUntil).toBe('11:30');
    expect(getPriceSettings(db).seatStandard).toBe(900);
    expectCode(() => updatePrices(db, { seatVip: -5 }), 'BAD_PRICE');
    expectCode(() => updatePrices(db, { morningUntil: '25:00' }), 'BAD_TIME');
  });
});

describe('admin sessions', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
  });
  afterEach(() => db.close());

  it('creates a session on a free future day', () => {
    const { movie, hall2d } = ids(db);
    // pick a far-future date with no sessions (schedule covers 28 days)
    const { id } = createSession(db, {
      movieId: movie.id,
      hallId: hall2d,
      date: '2027-01-15',
      time: '18:00',
      format: '2D',
    });
    expect(id).toBeGreaterThan(0);
  });

  it('rejects a session outside opening hours', () => {
    const { movie, hall2d } = ids(db);
    expectCode(
      () =>
        createSession(db, {
          movieId: movie.id,
          hallId: hall2d,
          date: '2027-01-15',
          time: '02:00',
          format: '2D',
        }),
      'OUTSIDE_HOURS',
    );
  });

  it('rejects overlapping sessions in the same hall', () => {
    const { movie, hall2d } = ids(db);
    createSession(db, {
      movieId: movie.id,
      hallId: hall2d,
      date: '2027-01-16',
      time: '18:00',
      format: '2D',
    });
    expectCode(
      () =>
        createSession(db, {
          movieId: movie.id,
          hallId: hall2d,
          date: '2027-01-16',
          time: '18:10',
          format: '2D',
        }),
      'OVERLAP',
    );
  });

  it('rejects 3D in a hall that has no 3D', () => {
    const { movie, hall2d } = ids(db);
    expectCode(
      () =>
        createSession(db, {
          movieId: movie.id,
          hallId: hall2d,
          date: '2027-01-17',
          time: '18:00',
          format: '3D',
        }),
      'FORMAT_UNSUPPORTED',
    );
  });

  it('bulk-creates from a weekly template and skips overlaps', () => {
    const { movie, hall3d } = ids(db);
    const result = bulkCreateSessions(db, {
      movieId: movie.id,
      hallId: hall3d,
      format: '2D',
      startDate: '2027-02-01', // a Monday
      weeks: 2,
      slots: [
        { weekday: 1, time: '10:00' },
        { weekday: 3, time: '10:00' },
      ],
    });
    expect(result.created).toBe(4);
  });

  it('cancels a session and refunds paid orders', () => {
    // create a fresh session far in the future, sell a ticket, then cancel
    const { movie, hall2d } = ids(db);
    const { id: sessionId } = createSession(db, {
      movieId: movie.id,
      hallId: hall2d,
      date: '2027-03-01',
      time: '18:00',
      format: '2D',
    });
    const cashier = db
      .prepare(
        "INSERT INTO users (email,password_hash,nickname,first_name,last_name,birth_date,role) VALUES ('c','x','c','C','R','1990-01-01','cashier')",
      )
      .run().lastInsertRowid;
    const seat = getSeatMap(db, sessionId).seats.find((s) => s.status === 'free').id;
    const { orderId } = sellAtBoxOffice(db, {
      sessionId,
      seatIds: [seat],
      method: 'cash',
      cashierId: cashier,
    });

    const result = cancelSession(db, sessionId);
    expect(result.refunded).toBe(1);
    expect(db.prepare('SELECT status FROM orders WHERE id = ?').pluck().get(orderId)).toBe(
      'refunded',
    );
    expect(db.prepare('SELECT status FROM sessions WHERE id = ?').pluck().get(sessionId)).toBe(
      'cancelled',
    );
    // the ticket is refunded, so the seat no longer blocks a resale
    const active = db
      .prepare(
        "SELECT COUNT(*) FROM tickets WHERE session_id = ? AND status IN ('reserved','valid','used')",
      )
      .pluck()
      .get(sessionId);
    expect(active).toBe(0);
  });
});

describe('admin users', () => {
  let db;
  let adminId;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    adminId = db
      .prepare(
        "INSERT INTO users (email,password_hash,nickname,first_name,last_name,birth_date,role) VALUES ('a','x','admin','A','D','1990-01-01','admin')",
      )
      .run().lastInsertRowid;
  });
  afterEach(() => db.close());

  it('changes a role and blocks a user', () => {
    const uid = db
      .prepare(
        "INSERT INTO users (email,password_hash,nickname,first_name,last_name,birth_date,role) VALUES ('u','x','user1','U','S','2000-01-01','user')",
      )
      .run().lastInsertRowid;
    let u = adminUpdateUser(db, uid, { role: 'cashier' }, adminId);
    expect(u.role).toBe('cashier');
    u = adminUpdateUser(db, uid, { isBlocked: true }, adminId);
    expect(u.isBlocked).toBe(true);
  });

  it('prevents an admin from demoting or blocking themselves', () => {
    expectCode(() => adminUpdateUser(db, adminId, { role: 'user' }, adminId), 'CANNOT_DEMOTE_SELF');
    expectCode(
      () => adminUpdateUser(db, adminId, { isBlocked: true }, adminId),
      'CANNOT_BLOCK_SELF',
    );
  });

  it('resets a nickname to a placeholder', () => {
    const uid = db
      .prepare(
        "INSERT INTO users (email,password_hash,nickname,first_name,last_name,birth_date,role) VALUES ('u2','x','baddie','U','S','2000-01-01','user')",
      )
      .run().lastInsertRowid;
    const u = adminUpdateUser(db, uid, { resetNickname: true }, adminId);
    expect(u.nickname).toBe(`user${uid}`);
  });
});

describe('admin word filter', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
  });
  afterEach(() => db.close());

  it('adds entries and rejects duplicates', () => {
    addWordFilter(db, { locale: 'en', list: 'hate', pattern: 'slur1' }, null);
    expect(listWordFilter(db).some((w) => w.pattern === 'slur1')).toBe(true);
    expectCode(
      () => addWordFilter(db, { locale: 'en', list: 'hate', pattern: 'slur1' }, null),
      'DUPLICATE',
    );
    expectCode(
      () => addWordFilter(db, { locale: 'xx', list: 'hate', pattern: 'x' }, null),
      'BAD_LOCALE',
    );
  });
});

describe('admin API access control', () => {
  let db;
  let app;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    app = createApp({ db, config: testConfig });
  });
  afterEach(() => db.close());

  async function cookieFor(role) {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: `${role}@kz.ee`,
        password: 'supersecret',
        nickname: role + 'x',
        firstName: 'A',
        lastName: 'B',
        birthDate: '1990-01-01',
      });
    if (role !== 'user')
      db.prepare('UPDATE users SET role = ? WHERE email = ?').run(role, `${role}@kz.ee`);
    return (reg.headers['set-cookie'] ?? []).map((c) => c.split(';')[0]).join('; ');
  }

  it('blocks non-admins from admin endpoints', async () => {
    expect((await request(app).get('/api/admin/movies')).status).toBe(401);
    const cashier = await cookieFor('cashier');
    expect((await request(app).get('/api/admin/movies').set('Cookie', cashier)).status).toBe(403);
    const admin = await cookieFor('admin');
    expect((await request(app).get('/api/admin/movies').set('Cookie', admin)).status).toBe(200);
  });
});
