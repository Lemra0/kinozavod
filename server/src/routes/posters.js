import { Router } from 'express';
import { ApiError } from '../errors.js';
import { demoPosterSvg } from '../modules/demo.js';

export function postersRouter() {
  const router = Router();

  router.get('/demo/:file', (req, res) => {
    const key = req.params.file.replace(/\.svg$/, '');
    const svg = demoPosterSvg(key);
    if (!svg) throw new ApiError(404, 'NOT_FOUND', 'Poster not found');
    res.type('image/svg+xml').set('Cache-Control', 'public, max-age=86400').send(svg);
  });

  return router;
}
