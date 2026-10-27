import { config, storeConfigured } from './config.js';

/* Enquiries are written to the database before the email is attempted, so a
 * bad SMTP password can never lose one.
 *
 * Two databases are supported, chosen by the connection string:
 *   postgres://…  Postgres (Vercel's Storage tab: Neon), through pg
 *   mysql://…     TiDB or MySQL, through mysql2
 * A serverless function gets a fresh process often and a reused one
 * sometimes, so this opens a connection per request and closes it in a
 * finally — no pool to leak across invocations. At this volume the handshake
 * costs nothing that matters.
 */

const isPostgres = /^postgres(ql)?:/i.test(config.database.url);

/* Indexes are declared inline rather than as separate CREATE INDEX statements:
   MySQL 8 has no CREATE INDEX IF NOT EXISTS, and one statement keeps mysql2's
   multi-statement guard off. utf8mb4 throughout — the copy has typographic
   quotes in it and a founder's name can be in any script. */
const SCHEMA = [`
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
  kind        VARCHAR(16)  NULL,
  details     TEXT         NULL,
  deck_url    VARCHAR(600) NULL,
  PRIMARY KEY (id),
  INDEX submissions_received_at (received_at),
  INDEX submissions_ip_received_at (ip, received_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`, `
CREATE TABLE IF NOT EXISTS subscribers (
  id          BIGINT       NOT NULL AUTO_INCREMENT,
  email       VARCHAR(255) NOT NULL,
  subscribed_at TIMESTAMP  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ip          VARCHAR(64)  NULL,
  user_agent  VARCHAR(320) NULL,
  spam        BOOLEAN      NOT NULL DEFAULT FALSE,
  PRIMARY KEY (id),
  UNIQUE KEY subscribers_email (email),
  INDEX subscribers_ip_subscribed_at (ip, subscribed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
`];

const PG_SCHEMA = [`
CREATE TABLE IF NOT EXISTS submissions (
  id          BIGSERIAL    PRIMARY KEY,
  received_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
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
  kind        VARCHAR(16)  NULL,
  details     TEXT         NULL,
  deck_url    VARCHAR(600) NULL
)`,
'CREATE INDEX IF NOT EXISTS submissions_received_at ON submissions (received_at)',
'CREATE INDEX IF NOT EXISTS submissions_ip_received_at ON submissions (ip, received_at)', `
CREATE TABLE IF NOT EXISTS subscribers (
  id            BIGSERIAL    PRIMARY KEY,
  email         VARCHAR(255) NOT NULL UNIQUE,
  subscribed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
  ip            VARCHAR(64)  NULL,
  user_agent    VARCHAR(320) NULL,
  spam          BOOLEAN      NOT NULL DEFAULT FALSE
)`,
'CREATE INDEX IF NOT EXISTS subscribers_ip_subscribed_at ON subscribers (ip, subscribed_at)'];

// Idempotent, but only worth running once per warm instance.
let schemaReady = false;

/* One small interface over both drivers: run(sql, params) → rows, with `?`
   placeholders either way; insert(sql, params) → the new row's id. */
async function connect() {
  if (isPostgres) {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: config.database.url, connectionTimeoutMillis: 10000 });
    await client.connect();
    const run = async (sql, params = []) => {
      let n = 0;
      const result = await client.query(sql.replace(/\?/g, () => `$${++n}`), params);
      return result.rows;
    };
    return {
      run,
      insert: async (sql, params) => Number((await run(`${sql} RETURNING id`, params))[0].id),
      end: () => client.end()
    };
  }

  const connection = await connectMysql();
  return {
    run: async (sql, params) => (await connection.query(sql, params))[0],
    // MySQL has no RETURNING; the insert id comes back on the result.
    insert: async (sql, params) => Number((await connection.execute(sql, params))[0].insertId),
    end: () => connection.end()
  };
}

async function connectMysql() {
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

/* Columns added after the first launch. A table created before them gets
   them here; MySQL has no ADD COLUMN IF NOT EXISTS, so "already there"
   (ER_DUP_FIELDNAME) is simply ignored. */
const LATER_COLUMNS = [
  'ALTER TABLE submissions ADD COLUMN kind VARCHAR(16) NULL',
  'ALTER TABLE submissions ADD COLUMN details TEXT NULL',
  'ALTER TABLE submissions ADD COLUMN deck_url VARCHAR(600) NULL'
];

async function ensureSchema(db) {
  if (schemaReady) return;
  if (isPostgres) {
    for (const statement of PG_SCHEMA) await db.run(statement);
    schemaReady = true;
    return;
  }
  for (const statement of SCHEMA) await db.run(statement);
  for (const statement of LATER_COLUMNS) {
    try {
      await db.run(statement);
    } catch (error) {
      if (error.code !== 'ER_DUP_FIELDNAME' && error.errno !== 1060) throw error;
    }
  }
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

  const db = await connect();
  try {
    await ensureSchema(db);

    if (submission.ip) {
      // The cutoff is computed here rather than with INTERVAL ? MINUTE, which
      // is the kind of thing drivers disagree about.
      const cutoff = new Date(Date.now() - config.rateLimit.windowMinutes * 60_000);
      const rows = await db.run(
        'SELECT COUNT(*) AS count FROM submissions WHERE ip = ? AND received_at > ?',
        [submission.ip, cutoff]
      );
      if (Number(rows[0].count) >= config.rateLimit.max) return { rateLimited: true };
    }

    const id = await db.insert(
      `INSERT INTO submissions
         (name, email, business, revenue, situation, ip, user_agent, spam, kind, details, deck_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        submission.name,
        submission.email,
        submission.business || null,
        submission.revenue || null,
        submission.situation || '',
        submission.ip || null,
        submission.userAgent || null,
        Boolean(submission.spam),
        submission.kind || null,
        submission.details ? JSON.stringify(submission.details) : null,
        submission.deckUrl || null
      ]
    );

    return { id };
  } finally {
    await db.end().catch(() => {});
  }
}

/** Record whether the notification email actually went out. */
export async function recordEmailResult(id, ok, error) {
  if (!storeConfigured || id == null) return;

  let db;
  try {
    db = await connect();
    await db.run(
      'UPDATE submissions SET emailed = ?, email_error = ? WHERE id = ?',
      [Boolean(ok), error ? String(error).slice(0, 500) : null, id]
    );
  } catch (updateError) {
    // The enquiry is already safely stored; this is only bookkeeping.
    console.error('[store] could not record email result:', updateError.message);
  } finally {
    if (db) await db.end().catch(() => {});
  }
}

/**
 * Add one newsletter sign-up. Signing up twice is not an error: the second
 * time just leaves the original row alone. Same rate limit as the form.
 *
 * Returns { rateLimited: true } or { ok: true }.
 */
export async function saveSubscriber(subscriber) {
  if (!storeConfigured) throw new Error('no_database_configured');

  const db = await connect();
  try {
    await ensureSchema(db);

    if (subscriber.ip) {
      const cutoff = new Date(Date.now() - config.rateLimit.windowMinutes * 60_000);
      const rows = await db.run(
        'SELECT COUNT(*) AS count FROM subscribers WHERE ip = ? AND subscribed_at > ?',
        [subscriber.ip, cutoff]
      );
      if (Number(rows[0].count) >= config.rateLimit.max) return { rateLimited: true };
    }

    await db.run(
      isPostgres
        ? 'INSERT INTO subscribers (email, ip, user_agent, spam) VALUES (?, ?, ?, ?) ON CONFLICT (email) DO NOTHING'
        : 'INSERT IGNORE INTO subscribers (email, ip, user_agent, spam) VALUES (?, ?, ?, ?)',
      [
        subscriber.email.toLowerCase(),
        subscriber.ip || null,
        subscriber.userAgent || null,
        Boolean(subscriber.spam)
      ]
    );
    return { ok: true };
  } finally {
    await db.end().catch(() => {});
  }
}

/** Everything the admin page shows, newest first. */
export async function listAll({ limit = 1000 } = {}) {
  if (!storeConfigured) throw new Error('no_database_configured');

  const db = await connect();
  try {
    await ensureSchema(db);
    const cap = Math.max(1, Math.min(Number(limit) || 1000, 10000));
    const submissions = await db.run(
      `SELECT id, received_at, kind, name, email, business, revenue, situation, details, deck_url,
              emailed, email_error, spam
         FROM submissions ORDER BY id DESC LIMIT ${cap}`
    );
    const subscribers = await db.run(
      `SELECT id, subscribed_at, email, spam FROM subscribers ORDER BY id DESC LIMIT ${cap}`
    );
    return { submissions, subscribers };
  } finally {
    await db.end().catch(() => {});
  }
}

/** Used by `npm run db:init` to create the table ahead of the first enquiry. */
export async function initSchema() {
  if (!storeConfigured) throw new Error('no_database_configured');
  const db = await connect();
  try {
    schemaReady = false;
    await ensureSchema(db);
  } finally {
    await db.end().catch(() => {});
  }
}
