import fs from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

/* Submissions are persisted before the email is attempted, so a bad SMTP
   password can never lose an enquiry. SQLite is the store; an append-only
   JSONL file is the parachute if SQLite is unavailable for any reason. */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS submissions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  received_at TEXT    NOT NULL,
  name        TEXT    NOT NULL,
  email       TEXT    NOT NULL,
  business    TEXT,
  revenue     TEXT,
  situation   TEXT    NOT NULL,
  ip          TEXT,
  user_agent  TEXT,
  emailed     INTEGER NOT NULL DEFAULT 0,
  email_error TEXT,
  spam        INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS submissions_received_at ON submissions (received_at);
`;

let db = null;
let insert = null;
let markEmailed = null;

function ensureDir(file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
}

export async function openStore() {
  ensureDir(config.databasePath);
  ensureDir(config.overflowLogPath);

  try {
    const { DatabaseSync } = await import('node:sqlite');
    db = new DatabaseSync(config.databasePath);
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA);

    // Older files predate the spam column; add it rather than start over.
    const columns = db.prepare('PRAGMA table_info(submissions)').all();
    if (!columns.some((column) => column.name === 'spam')) {
      db.exec('ALTER TABLE submissions ADD COLUMN spam INTEGER NOT NULL DEFAULT 0');
    }

    insert = db.prepare(`
      INSERT INTO submissions
        (received_at, name, email, business, revenue, situation, ip, user_agent, spam)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    markEmailed = db.prepare(
      'UPDATE submissions SET emailed = ?, email_error = ? WHERE id = ?'
    );

    // Enquiries are private. Keep the file readable by its owner only.
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        fs.chmodSync(config.databasePath + suffix, 0o600);
      } catch {
        /* the WAL companions may not exist yet */
      }
    }
    return { driver: 'sqlite', path: config.databasePath };
  } catch (error) {
    console.warn(
      '[store] SQLite unavailable (%s). Falling back to %s — Node 22.5+ is required for node:sqlite.',
      error.message,
      config.overflowLogPath
    );
    db = null;
    return { driver: 'jsonl', path: config.overflowLogPath };
  }
}

function appendJsonl(record) {
  fs.appendFileSync(config.overflowLogPath, JSON.stringify(record) + '\n', { mode: 0o600 });
}

/** Persist a submission. Returns an id when SQLite is in use, otherwise null. */
export function saveSubmission(submission) {
  const record = { received_at: new Date().toISOString(), ...submission };

  if (db && insert) {
    const result = insert.run(
      record.received_at,
      record.name,
      record.email,
      record.business || null,
      record.revenue || null,
      record.situation,
      record.ip || null,
      record.userAgent || null,
      record.spam ? 1 : 0
    );
    return Number(result.lastInsertRowid);
  }

  appendJsonl(record);
  return null;
}

/** Record whether the notification email actually went out. */
export function recordEmailResult(id, ok, error) {
  if (!db || !markEmailed || id == null) {
    if (!ok && error) appendJsonl({ type: 'email_failure', at: new Date().toISOString(), error });
    return;
  }
  try {
    markEmailed.run(ok ? 1 : 0, error ? String(error).slice(0, 500) : null, id);
  } catch (updateError) {
    console.error('[store] could not record email result:', updateError.message);
  }
}

export function closeStore() {
  if (db) {
    try {
      db.close();
    } catch {
      /* nothing useful to do while shutting down */
    }
    db = null;
  }
}
