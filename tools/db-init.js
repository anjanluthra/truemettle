import { initSchema } from '../src/store.js';
import { config, storeConfigured } from '../src/config.js';

/* Creates the submissions table. The function does this lazily on its first
   enquiry too, so this is only for making sure the database is reachable
   before the site goes anywhere near a founder. */

if (!storeConfigured) {
  console.error('No DATABASE_URL (or TIDB_HOST / TIDB_USER) set — nothing to initialise.');
  process.exit(1);
}

try {
  await initSchema();
  const where = config.database.url
    ? new URL(config.database.url).host
    : `${config.database.host}:${config.database.port}`;
  console.log(`Ready: submissions table exists on ${where}`);
} catch (error) {
  console.error('Could not reach the database:', error.message);
  process.exit(1);
}
