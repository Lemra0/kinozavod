import { config } from '../config.js';
import { openDatabase } from './index.js';
import { runMigrations } from './migrate.js';

const db = openDatabase(config.databasePath, { migrate: false });
const applied = runMigrations(db);
db.close();

console.log(
  applied.length > 0 ? `Applied migrations: ${applied.join(', ')}` : 'Database is up to date.',
);
console.log(`Database: ${config.databasePath}`);
