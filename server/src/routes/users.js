import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { generatedAvatarSvg } from '../modules/avatar.js';
import { parseId } from '../http.js';

/** Public per-user endpoints: avatar image (custom file or generated SVG). */
export function usersRouter({ db, config }) {
  const router = Router();
  const uploadsDir = path.join(config.paths.serverRoot, 'uploads', 'avatars');

  router.get('/:id/avatar', (req, res) => {
    const id = parseId(req.params.id);
    const user = db
      .prepare('SELECT nickname, avatar_path AS avatarPath FROM users WHERE id = ?')
      .get(id);
    if (!user) {
      res.type('image/svg+xml').send(generatedAvatarSvg('?'));
      return;
    }
    if (user.avatarPath) {
      const file = path.join(uploadsDir, user.avatarPath);
      if (fs.existsSync(file)) {
        res.type('image/webp').set('Cache-Control', 'public, max-age=3600').sendFile(file);
        return;
      }
    }
    res
      .type('image/svg+xml')
      .set('Cache-Control', 'public, max-age=600')
      .send(generatedAvatarSvg(user.nickname));
  });

  return router;
}
