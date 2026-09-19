import { Router } from 'express';
import { listHalls } from '../modules/halls.js';

export function hallsRouter({ db }) {
  const router = Router();
  router.get('/', (_req, res) => res.json({ halls: listHalls(db) }));
  return router;
}
