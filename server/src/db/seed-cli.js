import { config } from '../config.js';
import { openDatabase } from './index.js';
import { seedCatalog } from '../modules/catalog.js';
import { seedDemoData } from '../modules/demoData.js';

console.log('Rebuilding the catalog. Movies, sessions, orders and reviews will be replaced.');
const db = openDatabase(config.databasePath, { verbose: true });
await seedCatalog(db, { config });
// Re-seed demo accounts and their sample data after the catalog reset.
if (config.demoMode) {
  await seedDemoData(db);
  console.log('Demo accounts recreated.');
}
db.close();
