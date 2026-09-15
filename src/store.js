import { config, storeConfigured } from './config.js';

/* Enquiries are written to Postgres before the email is attempted, so a bad
   SMTP password can never lose one.
 *
 * A serverless function gets a fresh process often and a reused one sometimes,
 * so this opens a client per request and closes it — no pool to leak across
 * invocations. At this volume the extra handshake costs nothing that matters.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS submissions (
  id          BIGSERIAL PRIMARY KEY,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  name        TEXT        NOT NULL,
  email       TEXT        NOT NULL,
  business    TEXT,
  revenue     TEXT,
  situation   TEXT        NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  emailed     BOOLEAN     NOT NULL DEFAULT false,
  email_error TEXT,
  spam        BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS submissions_received_at ON submissions (received_at DESC);
CREATE INDEX IF NOT EXISTS submissions_ip_received_at ON submissions (ip, received_at DESC);
`;

// Idempotent, but only worth running once per warm instance.
let schemaReady = false;

async function connect() {
  const { default: pg } = await import('pg');
  const client = new pg.Client({
    connectionString: config.databaseUrl,
    // Hosted Postgres (Neon, Vercel, Supabase, RDS) is TLS-only, and their
    // certificates are not in Node's default trust store.
    ssl: /\bsslmode=disable\b/.test(config.databaseUrl)
      ? false
      : { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
    query_timeout: 10000
  });
  await client.connect();
  return client;
}

export async function ensureSchema(client) {
  if (schemaReady) return;
  await client.query(SCHEMA);
  schemaReady = true;
}

/**
 * Rate-check and store one submission on a single connection.
 *
 * The count is taken before the insert and the insert is skipped when the
 * limit is already spent, so a flood cannot fill the table with the rows it
 * was rejected for.
 *
 * Returns { rateLimited: true } or { id }.
 */
export async function saveSubmission(submission) {
  if (!storeConfigured) throw new Error('no_database_configured');

  const client = await connect();
  try {
    await ensureSchema(client);

    if (submission.ip) {
      const { rows } = await client.query(
        `SELECT count(*)::int AS count FROM submissions
         WHERE ip = $1 AND received_at > now() - ($2 || ' minutes')::interval`,
        [submission.ip, String(config.rateLimit.windowMinutes)]
      );
      if (rows[0].count >= config.rateLimit.max) return { rateLimited: true };
    }

    const { rows } = await client.query(
      `INSERT INTO submissions
         (name, email, business, revenue, situation, ip, user_agent, spam)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        submission.name,
        submission.email,
        submission.business || null,
        submission.revenue || null,
        submission.situation,
        submission.ip || null,
        submission.userAgent || null,
        Boolean(submission.spam)
      ]
    );

    return { id: Number(rows[0].id) };
  } finally {
    await client.end().catch(() => {});
  }
}

/** Record whether the notification email actually went out. */
export async function recordEmailResult(id, ok, error) {
  if (!storeConfigured || id == null) return;

  let client;
  try {
    client = await connect();
    await client.query('UPDATE submissions SET emailed = $1, email_error = $2 WHERE id = $3', [
      ok,
      error ? String(error).slice(0, 500) : null,
      id
    ]);
  } catch (updateError) {
    // The enquiry is already safely stored; this is only bookkeeping.
    console.error('[store] could not record email result:', updateError.message);
  } finally {
    if (client) await client.end().catch(() => {});
  }
}

/** Used by `npm run db:init` to create the table ahead of the first enquiry. */
export async function initSchema() {
  if (!storeConfigured) throw new Error('no_database_configured');
  const client = await connect();
  try {
    schemaReady = false;
    await ensureSchema(client);
  } finally {
    await client.end().catch(() => {});
  }
}
