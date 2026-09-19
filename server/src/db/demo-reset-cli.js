import { config } from '../config.js';
import { openDatabase } from './index.js';
import { seedDemoData } from '../modules/demoData.js';

const db = openDatabase(config.databasePath, { verbose: true });
await seedDemoData(db);
db.close();
console.log('Demo data reset: user / cashier / admin accounts recreated with sample data.');
