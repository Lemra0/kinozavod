import fs from 'node:fs';
import { config } from '../config.js';
import { openDatabase } from './index.js';

for (const suffix of ['', '-wal', '-shm']) {
  fs.rmSync(config.databasePath + suffix, { force: true });
}

const db = openDatabase(config.databasePath, { verbose: true });
db.close();

console.log(`Database recreated: ${config.databasePath}`);
