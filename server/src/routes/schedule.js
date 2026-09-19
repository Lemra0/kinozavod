import { Router } from 'express';
import { z } from 'zod';
import {
  CINEMA,
  RULES,
  addDays,
  isDateString,
  localDate,
  zonedTimeToDate,
} from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { langOf, parseQuery } from '../http.js';
import { findSessions } from '../modules/sessions.js';
import { listMovies, loadMovies } from '../modules/movies.js';

const TZ = CINEMA.timezone;

const querySchema = z.object({
  date: z.string().refine(isDateString).optional(),
  hall: z.enum(['p1', 'p2', 'p3']).optional(),
  format: z.enum(['2D', '3D']).optional(),
  lang: z.string().optional(),
});

/** Day schedule for the home page. */
export function scheduleRouter({ db }) {
  const router = Router();

  router.get('/', (req, res) => {
    const query = parseQuery(querySchema, req);
    const lang = langOf(req);
    const now = new Date();
    const today = localDate(now, TZ);
    const days = Array.from({ length: RULES.homeScheduleDays }, (_, i) => addDays(today, i));
    const date = query.date ?? today;

    if (!days.includes(date)) {
      throw new ApiError(400, 'DATE_OUT_OF_RANGE', 'The date is outside the schedule range');
    }

    const sessions = findSessions(db, {
      from: zonedTimeToDate(date, '00:00', TZ).toISOString(),
      to: zonedTimeToDate(addDays(date, 1), '00:00', TZ).toISOString(),
      hallCode: query.hall,
      format: query.format,
      now,
    });

    const movieIds = [...new Set(sessions.map((s) => s.movieId))];
    const movies = loadMovies(db, movieIds, lang);

    const list = movieIds.map((id) => ({
      ...movies.get(id),
      sessions: sessions.filter((s) => s.movieId === id),
    }));

    // Movies with sessions still ahead come first.
    const nextStart = (m) => m.sessions.find((s) => !s.past)?.startTime ?? '9999';
    list.sort((a, b) => nextStart(a).localeCompare(nextStart(b)));

    res.json({
      date,
      today,
      days,
      movies: list,
      soon: listMovies(db, { status: 'soon', today, lang }).slice(0, 4),
    });
  });

  return router;
}
