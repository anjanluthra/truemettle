import { initSchema } from '../src/store.js';
import { config, storeConfigured } from '../src/config.js';

/* Creates the submissions table. The function does this lazily on its first
   enquiry too, so this is only for making sure the database is reachable
   before the site goes anywhere near a founder. */

if (!storeConfigured) {
  console.error('No DATABASE_URL (or POSTGRES_URL) set — nothing to initialise.');
  process.exit(1);
}

try {
  await initSchema();
  const host = new URL(config.databaseUrl).host;
  console.log(`Ready: submissions table exists on ${host}`);
} catch (error) {
  console.error('Could not reach the database:', error.message);
  process.exit(1);
}
