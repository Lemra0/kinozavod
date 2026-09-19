import { Router } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'node:path';
import { RULES } from '@kinozavod/shared';
import { ApiError } from '../errors.js';
import { langOf } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import { checkNicknameFactory } from '../modules/wordfilter.js';
import { deleteAvatar, saveAvatar } from '../modules/avatar.js';
import { loadMovies } from '../modules/movies.js';
import { userReviews } from '../modules/reviews.js';
import {
  addToWatchlist,
  changePassword,
  deleteAccount,
  getWatchlist,
  meView,
  removeFromWatchlist,
  setGenres,
  updateProfile,
  userOrders,
} from '../modules/profile.js';

const patchSchema = z.object({
  nickname: z.string().min(3).max(20).optional(),
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  locale: z.enum(['en', 'ru', 'et']).optional(),
  showProfanity: z.boolean().optional(),
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

const genresSchema = z.object({ genres: z.array(z.number().int().positive()).max(30) });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: RULES.avatarMaxBytes },
});

export function meRouter({ db, config }) {
  const router = Router();
  const checkNickname = checkNicknameFactory(db);
  const uploadsDir = path.join(config.paths.serverRoot, 'uploads', 'avatars');

  router.use(requireAuth);

  router.get('/', (req, res) => res.json({ user: meView(db, req.user) }));

  router.patch('/', (req, res) => {
    const patch = patchSchema.parse(req.body);
    const updated = updateProfile(db, req.user, patch, { checkNickname });
    res.json({ user: meView(db, updated) });
  });

  router.post('/password', async (req, res) => {
    const data = passwordSchema.parse(req.body);
    await changePassword(db, req.user, data);
    res.json({ ok: true });
  });

  router.put('/genres', (req, res) => {
    const { genres } = genresSchema.parse(req.body);
    const saved = setGenres(db, req.user, genres);
    res.json({ genres: saved });
  });

  router.post('/avatar', upload.single('avatar'), async (req, res) => {
    if (!req.file) throw new ApiError(400, 'NO_FILE', 'No image uploaded');
    if (!/^image\/(jpe?g|png|webp)$/.test(req.file.mimetype)) {
      throw new ApiError(400, 'BAD_IMAGE', 'Only JPG, PNG or WebP are allowed');
    }
    let name;
    try {
      name = await saveAvatar(req.file.buffer, uploadsDir);
    } catch {
      throw new ApiError(400, 'BAD_IMAGE', 'The image could not be processed');
    }
    deleteAvatar(req.user.avatar_path, uploadsDir);
    db.prepare('UPDATE users SET avatar_path = ? WHERE id = ?').run(name, req.user.id);
    res.json({ ok: true, avatarUrl: `/api/users/${req.user.id}/avatar?v=${Date.now()}` });
  });

  router.delete('/avatar', (req, res) => {
    deleteAvatar(req.user.avatar_path, uploadsDir);
    db.prepare('UPDATE users SET avatar_path = NULL WHERE id = ?').run(req.user.id);
    res.json({ ok: true });
  });

  router.delete('/', (req, res) => {
    deleteAvatar(req.user.avatar_path, uploadsDir);
    deleteAccount(db, req.user);
    res.append(
      'Set-Cookie',
      'kz_session=; HttpOnly; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
    );
    res.json({ ok: true });
  });

  router.get('/orders', (req, res) => {
    res.json({ orders: userOrders(db, req.user, langOf(req)) });
  });

  router.get('/reviews', (req, res) => {
    res.json({ reviews: userReviews(db, req.user.id, langOf(req)) });
  });

  router.get('/watchlist', (req, res) => {
    const ids = getWatchlist(db, req.user);
    const movies = loadMovies(db, ids, langOf(req));
    res.json({ movies: ids.map((id) => movies.get(id)).filter(Boolean) });
  });

  router.put('/watchlist/:movieId', (req, res) => {
    addToWatchlist(db, req.user, Number(req.params.movieId));
    res.json({ ok: true });
  });

  router.delete('/watchlist/:movieId', (req, res) => {
    removeFromWatchlist(db, req.user, Number(req.params.movieId));
    res.json({ ok: true });
  });

  return router;
}
