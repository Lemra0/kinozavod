import { CINEMA, localDate } from '@kinozavod/shared';
import { seedHalls } from './halls.js';
import { insertMovie, rebuildSearchIndex, seedGenres } from './movies.js';
import { createTmdbClient, fetchTmdbCatalog } from './tmdb.js';
import { demoMovieRecords } from './demo.js';
import { ensureSchedule } from './schedule.js';

function setSetting(db, key, value) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  ).run(key, String(value));
}

export function getCatalogInfo(db) {
  const rows = db.prepare("SELECT key, value FROM settings WHERE key LIKE 'catalog.%'").all();
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return {
    source: map['catalog.source'] ?? null,
    seededAt: map['catalog.seeded_at'] ?? null,
    tmdbError: map['catalog.tmdb_error'] || null,
  };
}

/** Removes movies, sessions and everything that depends on them. Users stay. */
function clearCatalog(db) {
  db.transaction(() => {
    for (const table of [
      'payments',
      'tickets',
      'orders',
      'reviews',
      'watchlist',
      'sessions',
      'movie_genres',
      'movie_translations',
      'movies_search',
      'movies',
    ]) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
  })();
}

/**
 * Fills the catalog: genres, halls, movies (TMDB or demo) and the schedule.
 * Falls back to demo movies if TMDB is not configured or fails.
 */
export async function seedCatalog(db, { config, fetchImpl, log = console.log, now = new Date() }) {
  const today = localDate(now, CINEMA.timezone);
  seedGenres(db);
  seedHalls(db);

  let records = null;
  let source = 'demo';
  let tmdbError = '';

  if (config.tmdbApiKey) {
    try {
      log('Downloading movies from TMDB…');
      const client = createTmdbClient({ apiKey: config.tmdbApiKey, fetchImpl });
      records = await fetchTmdbCatalog(client, { today });
      if (records.length === 0) throw new Error('TMDB returned no movies');
      source = 'tmdb';
    } catch (error) {
      tmdbError = error.status === 401 ? 'INVALID_KEY' : 'UNAVAILABLE';
      log(`TMDB failed (${error.message}). Using demo movies instead.`);
      records = null;
    }
  }

  records ??= demoMovieRecords(today);

  clearCatalog(db);
  db.transaction(() => {
    for (const record of records) insertMovie(db, record);
  })();
  rebuildSearchIndex(db);
  const sessions = ensureSchedule(db, now);

  setSetting(db, 'catalog.source', source);
  setSetting(db, 'catalog.seeded_at', now.toISOString());
  setSetting(db, 'catalog.tmdb_error', tmdbError);

  log(`Catalog ready: ${records.length} movies (${source}), ${sessions} sessions.`);
  return { source, movies: records.length, sessions };
}

/** On server start: seed if empty, otherwise extend the schedule. */
export async function prepareCatalog(db, options) {
  const count = db.prepare('SELECT COUNT(*) FROM movies').pluck().get();
  if (count === 0) return seedCatalog(db, options);

  // A TMDB key was added after demo movies were created: switch to real movies,
  // but only while nobody has bought tickets yet.
  const { source } = getCatalogInfo(db);
  const orders = db.prepare('SELECT COUNT(*) FROM orders').pluck().get();
  if (options.config.tmdbApiKey && source === 'demo' && orders === 0) {
    return seedCatalog(db, options);
  }

  const sessions = ensureSchedule(db);
  if (sessions > 0) options.log?.(`Schedule extended: ${sessions} new sessions.`);
  return null;
}
