import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { ApiError } from '../errors.js';
import { createSession, destroySession, login, registerUser } from '../modules/auth.js';
import { DEMO_ACCOUNTS } from '../modules/demoData.js';
import { checkNicknameFactory } from '../modules/wordfilter.js';
import { meView } from '../modules/profile.js';
import { CSRF_COOKIE, SESSION_COOKIE } from '../middleware/auth.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { langOf } from '../http.js';

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  nickname: z.string().min(3).max(20),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  birthDate: z.string().refine(isDate),
  locale: z.enum(['en', 'ru', 'et']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

function setAuthCookies(res, { token, expiresAt }, secure) {
  const expires = new Date(expiresAt);
  const base = `Path=/; Expires=${expires.toUTCString()}; SameSite=Lax${secure ? '; Secure' : ''}`;
  const csrf = crypto.randomBytes(18).toString('base64url');
  res.append('Set-Cookie', `${SESSION_COOKIE}=${token}; HttpOnly; ${base}`);
  // CSRF cookie is readable by JS so the client can echo it in a header.
  res.append('Set-Cookie', `${CSRF_COOKIE}=${csrf}; ${base}`);
}

function clearAuthCookies(res) {
  const past = 'Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT';
  res.append('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; ${past}`);
  res.append('Set-Cookie', `${CSRF_COOKIE}=; ${past}`);
}

export function authRouter({ db, config }) {
  const router = Router();
  const checkNickname = checkNicknameFactory(db);
  const secure = config.env === 'production';
  const authLimit = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });

  router.get('/nickname-available', (req, res) => {
    const nickname = String(req.query.nickname ?? '');
    const taken = Boolean(db.prepare('SELECT 1 FROM users WHERE nickname = ?').get(nickname));
    const verdict = checkNickname(nickname);
    res.json({ available: !taken && verdict.allowed && nickname.length >= 3 });
  });

  router.post('/register', authLimit, async (req, res) => {
    const data = registerSchema.parse(req.body);
    const userId = await registerUser(
      db,
      { ...data, locale: data.locale ?? langOf(req) },
      { checkNickname },
    );
    const session = createSession(db, userId);
    setAuthCookies(res, session, secure);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
    res.status(201).json({ user: meView(db, user) });
  });

  router.post('/login', authLimit, async (req, res) => {
    const data = loginSchema.parse(req.body);
    const user = await login(db, data);
    const session = createSession(db, user.id);
    setAuthCookies(res, session, secure);
    res.json({ user: meView(db, user) });
  });

  router.post('/logout', (req, res) => {
    destroySession(db, req.sessionToken);
    clearAuthCookies(res);
    res.json({ ok: true });
  });

  // Demo login: one-click sign-in as a role, only when DEMO_MODE is on.
  if (config.demoMode) {
    router.post('/demo/:role', (req, res) => {
      const role = req.params.role;
      const account = DEMO_ACCOUNTS.find((a) => a.role === role);
      if (!account) throw new ApiError(400, 'BAD_DEMO_ROLE', 'Unknown demo role');
      const user = db
        .prepare('SELECT * FROM users WHERE email = ? AND is_demo = 1')
        .get(account.email);
      if (!user) throw new ApiError(503, 'DEMO_NOT_READY', 'Demo data is not seeded');
      const session = createSession(db, user.id);
      setAuthCookies(res, session, secure);
      res.json({ user: meView(db, user) });
    });
  }

  return router;
}
