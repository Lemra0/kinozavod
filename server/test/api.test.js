import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createTestDb, testConfig } from './helpers.js';

describe('API basics', () => {
  let db;
  let app;

  beforeAll(() => {
    db = createTestDb();
    app = createApp({ db, config: testConfig });
  });

  afterAll(() => {
    db.close();
  });

  it('GET /api/health answers ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /api/meta returns cinema info and prices', async () => {
    const res = await request(app).get('/api/meta');
    expect(res.status).toBe(200);
    expect(res.body.cinema.name).toBe('KINOZAVOD');
    expect(res.body.locales).toEqual(['en', 'ru', 'et']);
    expect(res.body.demoMode).toBe(true);
    expect(res.body.tmdbConfigured).toBe(false);
    expect(res.body.prices.seatVip).toBe(1100);
    expect(res.body.user).toBeNull();
  });

  it('unknown API routes return a JSON error with a code', async () => {
    const res = await request(app).get('/api/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  it('malformed JSON returns INVALID_JSON', async () => {
    const res = await request(app)
      .post('/api/health')
      .set('Content-Type', 'application/json')
      .send('{"broken":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});
