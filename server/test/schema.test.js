import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runMigrations } from '../src/db/migrate.js';
import { createTestDb, insertOrder, insertScreeningFixture } from './helpers.js';

describe('database schema', () => {
  let db;

  beforeEach(() => {
    db = createTestDb();
  });

  afterEach(() => {
    db.close();
  });

  it('applies migrations only once', () => {
    expect(runMigrations(db)).toEqual([]);
    const count = db.prepare('SELECT COUNT(*) FROM schema_migrations').pluck().get();
    expect(count).toBeGreaterThan(0);
  });

  it('enforces foreign keys', () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO seats (hall_id, row, number, type, grid_x, grid_y)
           VALUES (999, 1, 1, 'standard', 0, 0)`,
        )
        .run(),
    ).toThrow(/FOREIGN KEY/);
  });

  it('stores default prices in cents', () => {
    const value = db
      .prepare("SELECT value FROM settings WHERE key = 'price.seat.sofa'")
      .pluck()
      .get();
    expect(value).toBe('1600');
  });

  describe('double sale protection', () => {
    const insertTicket = (orderId, sessionId, seatId, code, status = 'reserved') =>
      db
        .prepare(
          `INSERT INTO tickets (order_id, session_id, seat_id, price, code, status)
           VALUES (?, ?, ?, 800, ?, ?)`,
        )
        .run(orderId, sessionId, seatId, code, status);

    it('does not allow two active tickets for the same seat', () => {
      const { sessionId, seatId } = insertScreeningFixture(db);
      insertTicket(insertOrder(db, sessionId, 'a@example.com'), sessionId, seatId, 'A1');

      expect(() =>
        insertTicket(insertOrder(db, sessionId, 'b@example.com'), sessionId, seatId, 'B1'),
      ).toThrow(/UNIQUE/);
    });

    it('frees the seat after a refund', () => {
      const { sessionId, seatId } = insertScreeningFixture(db);
      insertTicket(insertOrder(db, sessionId, 'a@example.com'), sessionId, seatId, 'A1');
      db.prepare("UPDATE tickets SET status = 'refunded' WHERE code = 'A1'").run();

      expect(() =>
        insertTicket(insertOrder(db, sessionId, 'b@example.com'), sessionId, seatId, 'B1'),
      ).not.toThrow();
    });
  });

  it('requires an email for online orders', () => {
    const { sessionId } = insertScreeningFixture(db);
    expect(() =>
      db
        .prepare(`INSERT INTO orders (session_id, channel, total) VALUES (?, 'online', 800)`)
        .run(sessionId),
    ).toThrow(/CHECK/);
    expect(() =>
      db
        .prepare(`INSERT INTO orders (session_id, channel, total) VALUES (?, 'box_office', 800)`)
        .run(sessionId),
    ).not.toThrow();
  });

  it('supports full-text search with diacritics removed', () => {
    db.prepare('INSERT INTO movies_search (content, movie_id) VALUES (?, ?)').run(
      'Õhtune film Вечерний фильм',
      1,
    );
    const found = db
      .prepare('SELECT movie_id FROM movies_search WHERE movies_search MATCH ?')
      .pluck()
      .all('ohtune');
    expect(found).toEqual([1]);
  });
});
