import { afterEach, describe, expect, it } from 'vitest';
import { getCatalogInfo, seedCatalog } from '../src/modules/catalog.js';
import { mapTmdbMovie } from '../src/modules/tmdb.js';
import { createTestDb, testConfig } from './helpers.js';

const NOW = new Date('2026-09-16T07:00:00.000Z');
const silent = () => {};

function details(id, extra = {}) {
  return {
    id,
    title: `Movie ${id}`,
    original_title: `Original ${id}`,
    original_language: 'en',
    overview: `Overview ${id}`,
    runtime: 100 + id,
    release_date: '2026-09-01',
    poster_path: `/poster${id}.jpg`,
    backdrop_path: `/backdrop${id}.jpg`,
    popularity: 100 - id,
    genres: [{ id: 28 }, { id: 18 }],
    production_countries: [{ iso_3166_1: 'US' }],
    credits: {
      crew: [
        { job: 'Producer', name: 'P' },
        { job: 'Director', name: `Director ${id}` },
      ],
      cast: [{ name: 'A' }, { name: 'B' }],
    },
    videos: {
      results: [
        { site: 'YouTube', type: 'Teaser', key: 'teaser', official: true, iso_639_1: 'en' },
        { site: 'YouTube', type: 'Trailer', key: `trailer${id}`, official: true, iso_639_1: 'en' },
      ],
    },
    release_dates: {
      results: [
        { iso_3166_1: 'US', release_dates: [{ certification: 'PG-13' }] },
        { iso_3166_1: 'EE', release_dates: [{ certification: '' }, { certification: 'K-12' }] },
      ],
    },
    translations: {
      translations: [
        { iso_639_1: 'ru', data: { title: `Фильм ${id}`, overview: `Описание ${id}` } },
        { iso_639_1: 'et', data: { title: '', overview: '' } },
      ],
    },
    ...extra,
  };
}

function fakeFetch(routes) {
  return async (url) => {
    const { pathname } = new URL(url);
    const key = pathname.replace('/3', '');
    if (!(key in routes)) return { ok: false, status: 404, json: async () => ({}) };
    const body = routes[key];
    if (body instanceof Error) return { ok: false, status: body.status, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => body };
  };
}

describe('TMDB mapping', () => {
  it('maps details into a movie record', () => {
    const movie = mapTmdbMovie(details(1), { today: '2026-09-16' });
    expect(movie).toMatchObject({
      source: 'tmdb',
      tmdbId: 1,
      originalTitle: 'Original 1',
      durationMin: 101,
      ageRating: 'K-12',
      trailerKey: 'trailer1',
      director: 'Director 1',
      cast: ['A', 'B'],
      genres: [28, 18],
      rentalStart: '2026-09-16',
      rentalEnd: '2026-10-27',
    });
    expect(movie.translations.ru).toEqual({ title: 'Фильм 1', overview: 'Описание 1' });
    expect(movie.translations.et).toBeUndefined();
  });

  it('starts upcoming movies on their release date', () => {
    const movie = mapTmdbMovie(details(2, { release_date: '2026-10-02' }), {
      today: '2026-09-16',
      upcoming: true,
    });
    expect(movie.rentalStart).toBe('2026-10-02');
  });

  it('ignores unknown certifications and missing runtime', () => {
    const movie = mapTmdbMovie(
      details(3, {
        runtime: 0,
        release_dates: { results: [{ iso_3166_1: 'EE', release_dates: [{ certification: 'X' }] }] },
      }),
      { today: '2026-09-16' },
    );
    expect(movie.ageRating).toBeNull();
    expect(movie.durationMin).toBe(110);
  });
});

describe('TMDB catalog', () => {
  let db;
  afterEach(() => db?.close());

  it('imports now playing and upcoming movies', async () => {
    db = createTestDb();
    const nowPlaying = {
      results: [1, 2, 3].map((id) => ({ id, popularity: 10 - id, genre_ids: [28] })),
    };
    const routes = {
      '/movie/now_playing': nowPlaying,
      '/movie/upcoming': {
        results: [
          { id: 3, release_date: '2026-10-01', genre_ids: [] },
          { id: 4, release_date: '2026-10-01', genre_ids: [] },
          { id: 5, release_date: '2026-09-01', genre_ids: [] },
        ],
      },
    };
    for (const id of [1, 2, 3]) routes[`/movie/${id}`] = details(id);
    routes['/movie/4'] = details(4, { release_date: '2026-10-01' });

    const result = await seedCatalog(db, {
      config: { ...testConfig, tmdbApiKey: 'test' },
      fetchImpl: fakeFetch(routes),
      log: silent,
      now: NOW,
    });

    expect(result.source).toBe('tmdb');
    expect(result.movies).toBe(4);
    expect(getCatalogInfo(db).source).toBe('tmdb');
    const soon = db
      .prepare('SELECT tmdb_id FROM movies WHERE rental_start > ?')
      .pluck()
      .all('2026-09-16');
    expect(soon).toEqual([4]);
  });

  it('falls back to demo movies when the key is rejected', async () => {
    db = createTestDb();
    const unauthorized = Object.assign(new Error('401'), { status: 401 });
    const result = await seedCatalog(db, {
      config: { ...testConfig, tmdbApiKey: 'wrong' },
      fetchImpl: fakeFetch({ '/movie/now_playing': unauthorized }),
      log: silent,
      now: NOW,
    });
    expect(result.source).toBe('demo');
    expect(getCatalogInfo(db)).toMatchObject({ source: 'demo', tmdbError: 'INVALID_KEY' });
  });
});
