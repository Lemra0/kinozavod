import { Router } from 'express';
import { z } from 'zod';
import { requireRole } from '../middleware/auth.js';
import { ApiError } from '../errors.js';
import { langOf, parseId } from '../http.js';
import {
  adminListMovies,
  refreshMovie,
  setArchived,
  tmdbImport,
  tmdbSearch,
  updateMovie,
} from '../modules/adminMovies.js';
import { updatePrices } from '../modules/adminPrices.js';
import { getPriceSettings } from '../settings.js';
import { listHalls } from '../modules/halls.js';
import {
  adminSessionsForDay,
  bulkCreateSessions,
  cancelSession,
  createSession,
  scheduleCoverageDays,
} from '../modules/adminSessions.js';
import { adminListUsers, adminUpdateUser } from '../modules/adminUsers.js';
import { adminListReviews, setReviewHidden } from '../modules/adminReviews.js';
import { addWordFilter, listWordFilter, removeWordFilter } from '../modules/adminWordFilter.js';
import { checkNicknameFactory } from '../modules/wordfilter.js';

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const AGE = ['PERE', 'L', 'MS-6', 'MS-12', 'K-12', 'K-14', 'K-16'];

const moviePatch = z.object({
  ageRating: z.enum(AGE).nullable().optional(),
  rentalStart: z.string().refine(isDate).optional(),
  rentalEnd: z.string().refine(isDate).nullable().optional(),
});
const pricePatch = z.object({
  seatStandard: z.number().int().min(0).optional(),
  seatVip: z.number().int().min(0).optional(),
  seatSofa: z.number().int().min(0).optional(),
  surcharge3dPerViewer: z.number().int().min(0).optional(),
  morningDiscountPerViewer: z.number().int().min(0).optional(),
  morningUntil: z.string().optional(),
});
const sessionSchema = z.object({
  movieId: z.number().int().positive(),
  hallId: z.number().int().positive(),
  date: z.string().refine(isDate),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  format: z.enum(['2D', '3D']),
});
const bulkSchema = z.object({
  movieId: z.number().int().positive(),
  hallId: z.number().int().positive(),
  format: z.enum(['2D', '3D']),
  startDate: z.string().refine(isDate),
  weeks: z.number().int().min(1).max(4),
  slots: z
    .array(
      z.object({
        weekday: z.number().int().min(1).max(7),
        time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
      }),
    )
    .min(1)
    .max(30),
});
const userPatch = z.object({
  role: z.enum(['user', 'cashier', 'admin']).optional(),
  isBlocked: z.boolean().optional(),
  birthDate: z.string().refine(isDate).optional(),
  resetAvatar: z.boolean().optional(),
  resetNickname: z.boolean().optional(),
});
const wordSchema = z.object({
  locale: z.enum(['en', 'ru', 'et']),
  list: z.enum(['profanity', 'hate', 'exception']),
  pattern: z.string().min(1).max(60),
  matchType: z.enum(['word', 'root']).optional(),
});

export function adminRouter({ db, config }) {
  const router = Router();
  router.use(requireRole('admin'));

  // --- movies ---
  router.get('/movies', (req, res) =>
    res.json({ movies: adminListMovies(db, { lang: langOf(req) }) }),
  );
  router.patch('/movies/:id', (req, res) => {
    res.json({ movie: updateMovie(db, parseId(req.params.id), moviePatch.parse(req.body)) });
  });
  router.post('/movies/:id/archive', (req, res) => {
    setArchived(db, parseId(req.params.id), req.body?.archived !== false);
    res.json({ ok: true });
  });
  router.post('/movies/:id/refresh', async (req, res) => {
    res.json(await refreshMovie(db, config, parseId(req.params.id)));
  });

  // --- TMDB import ---
  router.get('/tmdb/search', async (req, res) => {
    const query = String(req.query.q ?? '').trim();
    if (!query) return res.json({ results: [] });
    res.json({ results: await tmdbSearch(db, config, query) });
  });
  router.post('/tmdb/import', async (req, res) => {
    const tmdbId = Number(req.body?.tmdbId);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0)
      throw new ApiError(400, 'BAD_ID', 'tmdbId required');
    res.status(201).json(await tmdbImport(db, config, tmdbId));
  });

  // --- prices ---
  router.get('/prices', (_req, res) => res.json({ prices: getPriceSettings(db) }));
  router.patch('/prices', (req, res) =>
    res.json({ prices: updatePrices(db, pricePatch.parse(req.body)) }),
  );

  // --- halls ---
  router.get('/halls', (_req, res) => res.json({ halls: listHalls(db) }));

  // --- sessions ---
  router.get('/sessions', (req, res) => {
    const date = isDate(String(req.query.date)) ? req.query.date : undefined;
    if (!date) throw new ApiError(400, 'DATE_REQUIRED', 'date=YYYY-MM-DD required');
    res.json({
      sessions: adminSessionsForDay(db, { date, lang: langOf(req) }),
      coverageDays: scheduleCoverageDays(db),
    });
  });
  router.post('/sessions', (req, res) =>
    res.status(201).json(createSession(db, sessionSchema.parse(req.body))),
  );
  router.post('/sessions/bulk', (req, res) =>
    res.status(201).json(bulkCreateSessions(db, bulkSchema.parse(req.body))),
  );
  router.post('/sessions/:id/cancel', (req, res) =>
    res.json(cancelSession(db, parseId(req.params.id))),
  );

  // --- users ---
  router.get('/users', (req, res) =>
    res.json({ users: adminListUsers(db, { q: String(req.query.q ?? '') }) }),
  );
  router.patch('/users/:id', (req, res) => {
    const patch = userPatch.parse(req.body);
    res.json({ user: adminUpdateUser(db, parseId(req.params.id), patch, req.user.id) });
  });

  // --- reviews ---
  router.get('/reviews', (req, res) => {
    res.json({
      reviews: adminListReviews(db, { lang: langOf(req), onlyHate: req.query.onlyHate === '1' }),
    });
  });
  router.post('/reviews/:id/hide', (req, res) => {
    setReviewHidden(db, parseId(req.params.id), req.body?.hidden !== false);
    res.json({ ok: true });
  });

  // --- word filter ---
  router.get('/word-filter', (_req, res) => res.json({ items: listWordFilter(db) }));
  router.post('/word-filter', (req, res) =>
    res.status(201).json(addWordFilter(db, wordSchema.parse(req.body), req.user.id)),
  );
  router.delete('/word-filter/:id', (req, res) => {
    removeWordFilter(db, parseId(req.params.id));
    res.json({ ok: true });
  });
  router.post('/word-filter/test', (req, res) => {
    const check = checkNicknameFactory(db);
    const text = String(req.body?.text ?? '');
    res.json({ text, allowed: check(text).allowed });
  });

  return router;
}
