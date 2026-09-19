import { Router } from 'express';

export function healthRouter({ db }) {
  const router = Router();

  router.get('/', (_req, res) => {
    db.prepare('SELECT 1').get();
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  return router;
}
