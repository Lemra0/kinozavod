import { Router } from 'express';
import { z } from 'zod';
import { ApiError } from '../errors.js';
import { parseId } from '../http.js';
import { requireAuth } from '../middleware/auth.js';
import {
  createReview,
  deleteReview,
  listReviews,
  myReview,
  updateReview,
} from '../modules/reviews.js';

const bodySchema = z.object({
  rating: z.number().int().min(1).max(10),
  text: z.string().max(4000).optional().default(''),
});

export function reviewsRouter({ db }) {
  const router = Router();

  // Public list for a movie (rendered for the viewer).
  router.get('/movies/:id/reviews', (req, res) => {
    const movieId = parseId(req.params.id);
    const reviews = listReviews(db, movieId, { viewer: req.user });
    const mine = req.user ? myReview(db, req.user.id, movieId) : null;
    res.json({ reviews, mine });
  });

  // Create a review (auth required).
  router.post('/movies/:id/reviews', requireAuth, (req, res) => {
    const movieId = parseId(req.params.id);
    const { rating, text } = bodySchema.parse(req.body);
    const id = createReview(db, { userId: req.user.id, movieId, rating, text });
    res.status(201).json({ id });
  });

  // Edit own review.
  router.patch('/reviews/:id', requireAuth, (req, res) => {
    const reviewId = parseId(req.params.id);
    const { rating, text } = bodySchema.parse(req.body);
    updateReview(db, { userId: req.user.id, reviewId, rating, text });
    res.json({ ok: true });
  });

  // Delete own review.
  router.delete('/reviews/:id', requireAuth, (req, res) => {
    deleteReview(db, { userId: req.user.id, reviewId: parseId(req.params.id) });
    res.json({ ok: true });
  });

  return router;
}
