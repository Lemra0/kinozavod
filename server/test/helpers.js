import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { openDatabase } from '../src/db/index.js';

const testServerRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'kz-test-'));

export const testConfig = Object.freeze({
  env: 'test',
  port: 0,
  clientUrl: 'http://localhost:5173',
  databasePath: ':memory:',
  demoMode: true,
  tmdbApiKey: '',
  sessionSecret: 'test-secret',
  paths: { serverRoot: testServerRoot, projectRoot: testServerRoot },
});

export function createTestDb() {
  return openDatabase(':memory:');
}

/** Inserts the minimum rows needed to sell a ticket and returns their ids. */
export function insertScreeningFixture(db) {
  const movieId = db
    .prepare(
      `INSERT INTO movies (source, original_title, duration_min, age_rating_ee)
       VALUES ('demo', 'Test Movie', 100, 'L')`,
    )
    .run().lastInsertRowid;

  const hallId = db
    .prepare(
      `INSERT INTO halls (code, name_key, formats, has_zavod_sound)
       VALUES ('p9', 'halls.test', '2D', 0)`,
    )
    .run().lastInsertRowid;

  const seatId = db
    .prepare(
      `INSERT INTO seats (hall_id, row, number, type, grid_x, grid_y)
       VALUES (?, 1, 1, 'standard', 0, 0)`,
    )
    .run(hallId).lastInsertRowid;

  const sessionId = db
    .prepare(
      `INSERT INTO sessions (movie_id, hall_id, start_time, end_time, format, language)
       VALUES (?, ?, '2026-10-01T15:00:00.000Z', '2026-10-01T16:40:00.000Z', '2D', 'en')`,
    )
    .run(movieId, hallId).lastInsertRowid;

  return { movieId, hallId, seatId, sessionId };
}

export function insertOrder(db, sessionId, email = 'buyer@example.com') {
  return db
    .prepare(
      `INSERT INTO orders (email, session_id, channel, total)
       VALUES (?, ?, 'online', 800)`,
    )
    .run(email, sessionId).lastInsertRowid;
}
