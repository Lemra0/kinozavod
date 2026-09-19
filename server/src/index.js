import { config } from './config.js';
import { openDatabase } from './db/index.js';
import { createApp } from './app.js';
import { prepareCatalog } from './modules/catalog.js';
import { demoDataExists, seedDemoData } from './modules/demoData.js';
import { ensureSchedule } from './modules/schedule.js';
import { attachRealtime } from './modules/realtime.js';

const db = openDatabase(config.databasePath, { verbose: true });

console.log(`TMDB: ${config.tmdbApiKey ? 'key found' : 'no key, demo movies will be used'}`);
await prepareCatalog(db, { config, log: console.log });

// In demo mode, make sure the one-click demo accounts exist.
if (config.demoMode && !demoDataExists(db)) {
  await seedDemoData(db);
  console.log('Demo accounts ready: demo.user / demo.cashier / demo.admin');
}

const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`KINOZAVOD API: http://localhost:${config.port}/api`);
  console.log(`Demo mode: ${config.demoMode ? 'on' : 'off'}`);
  console.log('Realtime: Socket.IO ready');
});

const realtime = attachRealtime(server, { config });

// Keep four weeks of schedule ahead while the server is running.
const scheduleTimer = setInterval(
  () => {
    const created = ensureSchedule(db);
    if (created > 0) console.log(`Schedule extended: ${created} new sessions.`);
  },
  60 * 60 * 1000,
);

function shutdown() {
  clearInterval(scheduleTimer);
  realtime.close();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
