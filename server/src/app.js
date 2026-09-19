import express from 'express';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import { healthRouter } from './routes/health.js';
import { metaRouter } from './routes/meta.js';
import { scheduleRouter } from './routes/schedule.js';
import { moviesRouter } from './routes/movies.js';
import { searchRouter } from './routes/search.js';
import { hallsRouter } from './routes/halls.js';
import { postersRouter } from './routes/posters.js';
import { ordersRouter } from './routes/orders.js';
import { ageCheckRouter } from './routes/ageCheck.js';
import { createMailer } from './modules/mailer.js';
import { authRouter } from './routes/auth.js';
import { meRouter } from './routes/me.js';
import { usersRouter } from './routes/users.js';
import { attachUser, csrfProtection } from './middleware/auth.js';
import { staffRouter } from './routes/staff.js';
import { adminRouter } from './routes/admin.js';
import { reviewsRouter } from './routes/reviews.js';

/**
 * Builds the Express application.
 * Dependencies are passed in, so tests can use an in-memory database.
 */
export function createApp({ db, config, mailer = createMailer() }) {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 'loopback');
  app.use(express.json({ limit: '100kb' }));
  app.set('clientUrl', config.clientUrl);
  app.use(attachUser(db));

  const api = express.Router();
  api.use(csrfProtection);
  api.use('/health', healthRouter({ db }));
  api.use('/meta', metaRouter({ db, config }));
  api.use('/schedule', scheduleRouter({ db }));
  api.use('/movies', moviesRouter({ db }));
  api.use('/search', searchRouter({ db }));
  api.use('/halls', hallsRouter({ db }));
  api.use('/posters', postersRouter());
  api.use('/', ordersRouter({ db, mailer }));
  api.use('/age-check', ageCheckRouter({ db }));
  api.use('/auth', authRouter({ db, config }));
  api.use('/me', meRouter({ db, config }));
  api.use('/users', usersRouter({ db, config }));
  api.use('/staff', staffRouter({ db }));
  api.use('/admin', adminRouter({ db, config }));
  api.use('/', reviewsRouter({ db }));
  api.use(notFoundHandler);

  app.use('/api', api);
  app.use(errorHandler);

  return app;
}
