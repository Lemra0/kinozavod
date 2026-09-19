import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { runMigrations } from './migrate.js';

/**
 * Opens a SQLite database, applies connection settings and pending migrations.
 * @param {string} filename  path to the database file, or ':memory:' for tests
 */
export function openDatabase(filename, { migrate = true, verbose = false } = {}) {
  if (filename !== ':memory:') {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  if (migrate) {
    const applied = runMigrations(db);
    if (verbose && applied.length > 0) {
      console.log(`Applied migrations: ${applied.join(', ')}`);
    }
  }

  return db;
}
