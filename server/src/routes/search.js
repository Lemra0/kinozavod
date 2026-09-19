import { Router } from 'express';
import { z } from 'zod';
import { CINEMA, isDateString, localDate } from '@kinozavod/shared';
import { langOf, parseQuery } from '../http.js';
import { loadMovies } from '../modules/movies.js';
import { searchMovieIds } from '../modules/search.js';
import { searchSessions } from '../modules/searchSessions.js';
import { listGenres, listSessionLanguages } from '../modules/genres.js';

const suggestSchema = z.object({
  q: z.string().max(100).default(''),
  lang: z.string().optional(),
});

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const csvNumbers = z
  .string()
  .optional()
  .transform((v) => (v ? v.split(',').map(Number).filter(Number.isInteger) : []));

const searchSchema = z.object({
  q: z.string().max(100).optional().default(''),
  period: z.enum(['today', 'tomorrow', 'week', 'next-week', 'month', 'custom', 'all']).optional(),
  from: z.string().refine(isDateString).optional(),
  to: z.string().refine(isDateString).optional(),
  timeBand: z.enum(['morning', 'afternoon', 'evening', 'late']).optional(),
  timeFrom: z.string().regex(TIME).optional(),
  timeTo: z.string().regex(TIME).optional(),
  weekdays: z
    .string()
    .optional()
    .transform((v) =>
      v
        ? v
            .split(',')
            .map(Number)
            .filter((n) => n >= 1 && n <= 7)
        : [],
    ),
  genres: csvNumbers,
  format: z.enum(['2D', '3D']).optional(),
  hall: z.enum(['p1', 'p2', 'p3']).optional(),
  language: z.string().max(8).optional(),
  zavodSound: z.coerce.boolean().optional(),
  age: z.enum(['all', 'no-restricted', 'family']).optional(),
  hasSeats: z.coerce.boolean().optional(),
  premiumSeats: z.coerce.boolean().optional(),
  together: z.coerce.number().int().min(1).max(10).optional(),
  maxDuration: z.coerce.number().int().min(30).max(400).optional(),
  sort: z.enum(['time', 'title', 'rating', 'popularity', 'price', 'duration']).optional(),
  view: z.enum(['movies', 'time']).optional(),
  page: z.coerce.number().int().min(0).max(500).optional(),
  lang: z.string().optional(),
});

export function searchRouter({ db }) {
  const router = Router();

  // Options for the filter panel: genres, languages, halls.
  router.get('/filters', (req, res) => {
    const lang = langOf(req);
    res.json({
      genres: listGenres(db, lang),
      languages: listSessionLanguages(db),
    });
  });

  // Quick-search suggestions for the header.
  router.get('/suggest', (req, res) => {
    const { q } = parseQuery(suggestSchema, req);
    if (q.trim().length < 2) return res.json({ movies: [] });

    const ids = searchMovieIds(db, q, 6);
    const movies = loadMovies(db, ids, langOf(req));
    const now = new Date().toISOString();
    const today = localDate(new Date(), CINEMA.timezone);
    const nextSession = db.prepare(
      `SELECT id, start_time AS startTime FROM sessions
       WHERE movie_id = ? AND status = 'scheduled' AND start_time > ?
       ORDER BY start_time LIMIT 1`,
    );

    res.json({
      movies: ids.map((id) => {
        const m = movies.get(id);
        return {
          id: m.id,
          title: m.title,
          originalTitle: m.originalTitle,
          year: m.year,
          posterUrl: m.posterUrl,
          soon: m.rentalStart > today,
          nextSession: nextSession.get(id, now) ?? null,
        };
      }),
    });
  });

  // Full search with filters and sorting.
  router.get('/', (req, res) => {
    const filters = parseQuery(searchSchema, req);
    const lang = langOf(req);
    const result = searchSessions(db, { ...filters, lang });

    const movieIds = [...new Set(result.sessions.map((s) => s.movieId))];
    const movies = loadMovies(db, movieIds, lang);

    res.json({
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      range: { from: result.range.fromDate, to: result.range.toDate },
      view: filters.view ?? 'movies',
      sort: filters.sort ?? 'time',
      movies: movieIds.map((id) => movies.get(id)),
      sessions: result.sessions,
    });
  });

  return router;
}
