import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { seedCatalog } from '../src/modules/catalog.js';
import { DEMO_ACCOUNTS, demoDataExists, seedDemoData } from '../src/modules/demoData.js';
import { changePassword, deleteAccount } from '../src/modules/profile.js';
import { adminUpdateUser } from '../src/modules/adminUsers.js';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

function expectCode(fn, code) {
  try {
    const r = fn();
    if (r && typeof r.then === 'function')
      return r.then(
        () => {
          throw new Error(`Expected ${code}`);
        },
        (e) => expect(e.code).toBe(code),
      );
  } catch (e) {
    expect(e.code).toBe(code);
    return undefined;
  }
  throw new Error(`Expected ${code}`);
}

describe('demo data', () => {
  let db;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
  });
  afterEach(() => db.close());

  it('seeds three demo accounts with sample data', async () => {
    await seedDemoData(db);
    expect(demoDataExists(db)).toBe(true);
    const roles = db
      .prepare('SELECT role FROM users WHERE is_demo = 1 ORDER BY role')
      .pluck()
      .all();
    expect(roles).toEqual(['admin', 'cashier', 'user']);
    const userId = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .pluck()
      .get(DEMO_ACCOUNTS[0].email);
    // user has an order, reviews and a watchlist
    expect(
      db.prepare('SELECT COUNT(*) FROM orders WHERE user_id = ?').pluck().get(userId),
    ).toBeGreaterThan(0);
    expect(
      db.prepare('SELECT COUNT(*) FROM reviews WHERE user_id = ?').pluck().get(userId),
    ).toBeGreaterThan(0);
    expect(
      db.prepare('SELECT COUNT(*) FROM watchlist WHERE user_id = ?').pluck().get(userId),
    ).toBeGreaterThan(0);
    // cashier has box-office sales
    const cashierId = db
      .prepare('SELECT id FROM users WHERE email = ?')
      .pluck()
      .get(DEMO_ACCOUNTS[1].email);
    expect(
      db.prepare('SELECT COUNT(*) FROM orders WHERE cashier_id = ?').pluck().get(cashierId),
    ).toBeGreaterThan(0);
  });

  it('re-seeding replaces demo data without duplicating accounts', async () => {
    await seedDemoData(db);
    await seedDemoData(db);
    expect(db.prepare('SELECT COUNT(*) FROM users WHERE is_demo = 1').pluck().get()).toBe(3);
  });

  it('protects demo accounts from changes', async () => {
    await seedDemoData(db);
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(DEMO_ACCOUNTS[0].email);
    await expectCode(
      () => changePassword(db, user, { currentPassword: 'demo', newPassword: 'longenough' }),
      'DEMO_LOCKED',
    );
    expectCode(() => deleteAccount(db, user), 'DEMO_LOCKED');
    expectCode(() => adminUpdateUser(db, user.id, { role: 'admin' }, 999), 'DEMO_LOCKED');
  });
});

describe('demo login API', () => {
  let db;
  let app;
  beforeEach(async () => {
    db = createTestDb();
    await seedCatalog(db, { config: testConfig, log: vi.fn() });
    await seedDemoData(db);
    app = createApp({ db, config: testConfig });
  });
  afterEach(() => db.close());

  it('signs in as each role with one click', async () => {
    for (const role of ['user', 'cashier', 'admin']) {
      const res = await request(app).post(`/api/auth/demo/${role}`).send();
      expect(res.status).toBe(200);
      expect(res.body.user.role).toBe(role);
      expect((res.headers['set-cookie'] ?? []).some((c) => c.startsWith('kz_session'))).toBe(true);
    }
  });

  it('rejects an unknown demo role', async () => {
    const res = await request(app).post('/api/auth/demo/wizard').send();
    expect(res.status).toBe(400);
  });

  it('is disabled when DEMO_MODE is off', async () => {
    const prodDb = createTestDb();
    await seedCatalog(prodDb, { config: testConfig, log: vi.fn() });
    const prodApp = createApp({ db: prodDb, config: { ...testConfig, demoMode: false } });
    const res = await request(prodApp).post('/api/auth/demo/admin').send();
    expect(res.status).toBe(404);
    prodDb.close();
  });
});
