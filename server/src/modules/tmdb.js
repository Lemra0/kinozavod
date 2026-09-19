import { AGE_RATINGS, addDays } from '@kinozavod/shared';

const API_BASE = 'https://api.themoviedb.org/3';
const THREE_D_GENRES = new Set([16, 878, 12, 28, 14]);

export function createTmdbClient({ apiKey, fetchImpl = fetch }) {
  async function get(path, params = {}) {
    const url = new URL(API_BASE + path);
    url.searchParams.set('api_key', apiKey);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
    }
    const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
    if (!res.ok) {
      const error = new Error(`TMDB ${path} answered ${res.status}`);
      error.status = res.status;
      throw error;
    }
    return res.json();
  }

  return {
    nowPlaying: (params) => get('/movie/now_playing', { language: 'en-US', page: 1, ...params }),
    upcoming: (params) => get('/movie/upcoming', { language: 'en-US', page: 1, ...params }),
    search: (query) =>
      get('/search/movie', { language: 'en-US', query, page: 1, include_adult: false }),
    details: (id) =>
      get(`/movie/${id}`, {
        language: 'en-US',
        append_to_response: 'credits,videos,release_dates,translations',
      }),
  };
}

function estonianRating(details) {
  const ee = details.release_dates?.results?.find((r) => r.iso_3166_1 === 'EE');
  const found = ee?.release_dates
    ?.map((d) =>
      String(d.certification || '')
        .trim()
        .toUpperCase(),
    )
    .find((c) => c in AGE_RATINGS);
  return found ?? null;
}

function pickTrailer(details) {
  const videos = (details.videos?.results ?? []).filter(
    (v) => v.site === 'YouTube' && ['Trailer', 'Teaser'].includes(v.type),
  );
  const score = (v) =>
    (v.type === 'Trailer' ? 4 : 0) + (v.official ? 2 : 0) + (v.iso_639_1 === 'en' ? 1 : 0);
  return videos.sort((a, b) => score(b) - score(a))[0]?.key ?? null;
}

function translation(details, lang) {
  const t = details.translations?.translations?.find((x) => x.iso_639_1 === lang);
  if (!t?.data?.title && !t?.data?.overview) return undefined;
  return {
    title: t.data.title || details.title,
    overview: t.data.overview || null,
  };
}

/**
 * Turns TMDB movie details into our movie record.
 * `upcoming` movies start their rental on the release date.
 */
export function mapTmdbMovie(details, { today, upcoming = false, supports3d = false }) {
  const releaseDate = details.release_date || null;
  const rentalStart = upcoming && releaseDate && releaseDate > today ? releaseDate : today;

  return {
    source: 'tmdb',
    tmdbId: details.id,
    originalTitle: details.original_title || details.title,
    originalLanguage: details.original_language || 'en',
    durationMin: details.runtime > 0 ? details.runtime : 110,
    ageRating: estonianRating(details),
    releaseDate,
    rentalStart,
    rentalEnd: addDays(rentalStart, 41),
    posterPath: details.poster_path || null,
    backdropPath: details.backdrop_path || null,
    trailerKey: pickTrailer(details),
    country: details.production_countries?.[0]?.iso_3166_1 ?? null,
    year: releaseDate ? Number(releaseDate.slice(0, 4)) : null,
    director: details.credits?.crew?.find((c) => c.job === 'Director')?.name ?? null,
    cast: (details.credits?.cast ?? []).slice(0, 5).map((c) => c.name),
    genres: (details.genres ?? []).map((g) => g.id),
    supports3d,
    popularity: details.popularity ?? 0,
    fetchedAt: new Date().toISOString(),
    translations: {
      en: { title: details.title, overview: details.overview || null },
      ru: translation(details, 'ru'),
      et: translation(details, 'et'),
    },
  };
}

async function mapInBatches(items, size, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(...(await Promise.all(items.slice(i, i + size).map(fn))));
  }
  return out;
}

/**
 * Downloads movies that are in cinemas now and a few upcoming ones.
 * Returns movie records ready for insertMovie().
 */
export async function fetchTmdbCatalog(client, { today, nowCount = 12, soonCount = 4 }) {
  let now = (await client.nowPlaying({ region: 'EE' })).results ?? [];
  if (now.length < nowCount) {
    const global = (await client.nowPlaying()).results ?? [];
    const seen = new Set(now.map((m) => m.id));
    now = [...now, ...global.filter((m) => !seen.has(m.id))];
  }
  now = now
    .filter((m) => !m.adult)
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, nowCount);

  const nowIds = new Set(now.map((m) => m.id));
  const soon = ((await client.upcoming({ region: 'EE' })).results ?? [])
    .filter((m) => !m.adult && !nowIds.has(m.id) && m.release_date > today)
    .sort((a, b) => a.release_date.localeCompare(b.release_date))
    .slice(0, soonCount);

  const threeD = new Set(
    now
      .filter((m) => (m.genre_ids ?? []).some((g) => THREE_D_GENRES.has(g)))
      .slice(0, 4)
      .map((m) => m.id),
  );

  const nowRecords = await mapInBatches(now, 4, async (m) =>
    mapTmdbMovie(await client.details(m.id), { today, supports3d: threeD.has(m.id) }),
  );
  const soonRecords = await mapInBatches(soon, 4, async (m) =>
    mapTmdbMovie(await client.details(m.id), {
      today,
      upcoming: true,
      supports3d: (m.genre_ids ?? []).some((g) => THREE_D_GENRES.has(g)),
    }),
  );

  return [...nowRecords, ...soonRecords];
}
