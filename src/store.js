import { config, storeConfigured } from './config.js';

/* Enquiries are written to TiDB before the email is attempted, so a bad SMTP
 * password can never lose one.
 *
 * TiDB speaks the MySQL protocol, so this is mysql2 talking to it. A
 * serverless function gets a fresh process often and a reused one sometimes,
 * so this opens a connection per request and closes it in a finally — no pool
 * to leak across invocations. At this volume the handshake costs nothing that
 * matters.
 */

/* Indexes are declared inline rather than as separate CREATE INDEX statements:
   MySQL 8 has no CREATE INDEX IF NOT EXISTS, and one statement keeps mysql2's
   multi-statement guard off. utf8mb4 throughout — the copy has typographic
   quotes in it and a founder's name can be in any script. */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS submissions (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  received_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
  name        VARCHAR(160) NOT NULL,
  email       VARCHAR(255) NOT NULL,
  business    VARCHAR(255) NULL,
  revenue     VARCHAR(160) NULL,
  situation   TEXT         NOT NULL,
  ip          VARCHAR(64)  NULL,
  user_agent  VARCHAR(320) NULL,
  emailed     BOOLEAN      NOT NULL DEFAULT FALSE,
  email_error VARCHAR(512) NULL,
  spam        BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  INDEX submissions_received_at (received_at),
  INDEX submissions_ip_received_at (ip, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`;

// Idempotent, but only worth running once per warm instance.
let schemaReady = false;

async function connect() {
  const { default: mysql } = await import('mysql2/promise');

  const options = {
    // Round-trip timestamps as UTC rather than the server's local zone.
    timezone: 'Z',
    connectTimeout: 10000,
    // TiDB Cloud is TLS-only and presents a publicly trusted certificate, so
    // ordinary verification is both possible and worth keeping.
    ssl: config.database.ssl ? { minVersion: 'TLSv1.2' } : undefined
  };

  return config.database.url
    ? mysql.createConnection({ uri: config.database.url, ...options })
    : mysql.createConnection({
        host: config.database.host,
        port: config.database.port,
        user: config.database.user,
        password: config.database.password,
        database: config.database.name,
        ...options
      });
}

async function ensureSchema(connection) {
  if (schemaReady) return;
  await connection.query(SCHEMA);
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

  const connection = await connect();
  try {
    await ensureSchema(connection);

    if (submission.ip) {
      // The cutoff is computed here rather than with INTERVAL ? MINUTE, which
      // is the kind of thing drivers disagree about.
      const cutoff = new Date(Date.now() - config.rateLimit.windowMinutes * 60_000);
      const [rows] = await connection.execute(
        'SELECT COUNT(*) AS count FROM submissions WHERE ip = ? AND received_at > ?',
        [submission.ip, cutoff]
      );
      if (Number(rows[0].count) >= config.rateLimit.max) return { rateLimited: true };
    }

    // MySQL has no RETURNING; the insert id comes back on the result.
    const [result] = await connection.execute(
      `INSERT INTO submissions
         (name, email, business, revenue, situation, ip, user_agent, spam)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submission.name,
        submission.email,
        submission.business || null,
        submission.revenue || null,
        submission.situation,
        submission.ip || null,
        submission.userAgent || null,
        submission.spam ? 1 : 0
      ]
    );

    return { id: Number(result.insertId) };
  } finally {
    await connection.end().catch(() => {});
  }
}

/** Record whether the notification email actually went out. */
export async function recordEmailResult(id, ok, error) {
  if (!storeConfigured || id == null) return;

  let connection;
  try {
    connection = await connect();
    await connection.execute(
      'UPDATE submissions SET emailed = ?, email_error = ? WHERE id = ?',
      [ok ? 1 : 0, error ? String(error).slice(0, 500) : null, id]
    );
  } catch (updateError) {
    // The enquiry is already safely stored; this is only bookkeeping.
    console.error('[store] could not record email result:', updateError.message);
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

/** Used by `npm run db:init` to create the table ahead of the first enquiry. */
export async function initSchema() {
  if (!storeConfigured) throw new Error('no_database_configured');
  const connection = await connect();
  try {
    schemaReady = false;
    await ensureSchema(connection);
  } finally {
    await connection.end().catch(() => {});
  }
}
