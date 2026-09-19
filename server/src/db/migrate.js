import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'migrations');

/**
 * Applies all SQL files from ./migrations that have not been applied yet.
 * Each file runs in its own transaction. Returns the names of applied files.
 */
export function runMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )
  `);

  const done = new Set(db.prepare('SELECT name FROM schema_migrations').pluck().all());
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const markApplied = db.prepare('INSERT INTO schema_migrations (name) VALUES (?)');
  const applied = [];

  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    db.transaction(() => {
      db.exec(sql);
      markApplied.run(file);
    })();
    applied.push(file);
  }

  return applied;
}
