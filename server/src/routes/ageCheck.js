import { Router } from 'express';
import { z } from 'zod';
import { ageOn, AGE_RATINGS, CINEMA, localDate } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { parseIsikukood } from '../modules/isikukood.js';

const schema = z.object({
  isikukood: z.string(),
  sessionId: z.number().int().positive(),
});

/**
 * Demo age check by isikukood. The code is validated and its birth date
 * compared to the session's rating. The code is never stored or logged;
 * on success we return only whether the buyer passes.
 */
export function ageCheckRouter({ db }) {
  const router = Router();

  router.post('/demo', (req, res) => {
    const body = schema.parse(req.body);
    const parsed = parseIsikukood(body.isikukood);
    if (!parsed.valid) throw new ApiError(400, 'INVALID_ISIKUKOOD', 'Invalid personal code');

    const session = db
      .prepare(
        `SELECT s.start_time AS startTime, m.age_rating_ee AS ageRating
         FROM sessions s JOIN movies m ON m.id = s.movie_id WHERE s.id = ?`,
      )
      .get(body.sessionId);
    if (!session) throw new ApiError(404, 'SESSION_NOT_FOUND', 'Session not found');

    const rating = AGE_RATINGS[session.ageRating];
    const minAge = rating?.restricted ? rating.minAge : 0;
    const sessionDate = localDate(new Date(session.startTime), CINEMA.timezone);
    const passes = ageOn(parsed.birthDate, sessionDate) >= minAge;

    res.json({ passes, minAge });
  });

  return router;
}
