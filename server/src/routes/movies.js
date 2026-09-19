import { Router } from 'express';
import { z } from 'zod';
import { CINEMA, RULES, addDays, localDate, zonedTimeToDate } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { langOf, parseId, parseQuery } from '../http.js';
import { getMovie, listMovies } from '../modules/movies.js';
import { findSessions } from '../modules/sessions.js';

const TZ = CINEMA.timezone;

const listSchema = z.object({
  status: z.enum(['now', 'soon']).default('now'),
  lang: z.string().optional(),
});

export function moviesRouter({ db }) {
  const router = Router();

  router.get('/', (req, res) => {
    const { status } = parseQuery(listSchema, req);
    const today = localDate(new Date(), TZ);
    res.json({ movies: listMovies(db, { status, today, lang: langOf(req) }) });
  });

  router.get('/:id', (req, res) => {
    const movie = getMovie(db, parseId(req.params.id), langOf(req));
    if (!movie) throw new ApiError(404, 'MOVIE_NOT_FOUND', 'Movie not found');

    const now = new Date();
    const today = localDate(now, TZ);
    const sessions = findSessions(db, {
      from: now.toISOString(),
      to: zonedTimeToDate(addDays(today, RULES.scheduleHorizonDays), '00:00', TZ).toISOString(),
      movieId: movie.id,
      now,
    });

    res.json({ movie, sessions, today });
  });

  return router;
}
