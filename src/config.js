import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* A five-line .env reader for local development. On Vercel the environment
   is already populated, and no .env file exists. */
function loadDotEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/i.exec(line);
    if (!match) continue;
    const key = match[1];
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

try {
  loadDotEnv();
} catch {
  /* a read-only filesystem is fine — the environment is already set */
}

const bool = (value, fallback = false) =>
  value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value);

/* The values baked into public/index.html, so the static host serving that
   file gets a correct page. Only a differing environment rewrites them. */
export const DEFAULTS = {
  siteUrl: 'https://truemettle.co',
  personalSiteUrl: 'https://anjanluthra.com'
};

export const config = {
  port: Number(process.env.PORT || 3000),

  // Canonical origin, used for canonical/OG tags. No trailing slash.
  siteUrl: (process.env.SITE_URL || DEFAULTS.siteUrl).replace(/\/+$/, ''),

  // The personal site. Empty renders "Anjan Luthra" as plain text, not a link.
  personalSiteUrl: (process.env.PERSONAL_SITE_URL ?? DEFAULTS.personalSiteUrl).trim(),

  /* TiDB, which speaks MySQL. TiDB Cloud's connect dialog hands you either a
     connection string or the five parts separately — take whichever is set. */
  database: {
    // Vercel's Postgres (Neon) sets DATABASE_URL and POSTGRES_URL; TiDB's is a mysql:// one.
    url: process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.TIDB_URL || '',
    host: process.env.TIDB_HOST || '',
    port: Number(process.env.TIDB_PORT || 4000),
    user: process.env.TIDB_USER || '',
    password: process.env.TIDB_PASSWORD || '',
    name: process.env.TIDB_DATABASE || 'truemettle',
    // TiDB Cloud is TLS-only. Off only for a local MySQL in development.
    ssl: !/^(0|false|no|off)$/i.test(process.env.TIDB_SSL ?? 'true')
  },

  mail: {
    to: process.env.CONTACT_EMAIL_TO || '',
    from: process.env.CONTACT_EMAIL_FROM || '',
    subjectPrefix: process.env.CONTACT_SUBJECT_PREFIX || 'True Mettle',
    smtp: {
      host: process.env.SMTP_HOST || '',
      port: Number(process.env.SMTP_PORT || 587),
      secure: bool(process.env.SMTP_SECURE, Number(process.env.SMTP_PORT || 587) === 465),
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || ''
    }
  },

  rateLimit: {
    max: Number(process.env.RATE_LIMIT_MAX || 5),
    windowMinutes: Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 60)
  }
};

export const mailConfigured = Boolean(
  config.mail.to && config.mail.from && config.mail.smtp.host
);

export const storeConfigured = Boolean(
  config.database.url || (config.database.host && config.database.user)
);

// Vercel Blob, for deck uploads. Without it the form asks for a few lines instead.
// A store connected the current way sets only BLOB_STORE_ID, and the function
// signs in with the deployment's own OIDC identity. An older connection sets a
// read-write token instead: BLOB_READ_WRITE_TOKEN, or <PREFIX>_READ_WRITE_TOKEN
// when the store was given a custom prefix.
export const blobToken =
  process.env.BLOB_READ_WRITE_TOKEN ||
  Object.entries(process.env).find(([key, value]) => /_READ_WRITE_TOKEN$/.test(key) && /^vercel_blob_rw_/.test(value || ''))?.[1] ||
  '';
export const blobConfigured = Boolean(blobToken || process.env.BLOB_STORE_ID);

// Credentials for @vercel/blob calls made while answering a request.
export const blobAuth = (req) =>
  blobToken ? { token: blobToken } : { oidcToken: String(req.headers['x-vercel-oidc-token'] || process.env.VERCEL_OIDC_TOKEN || '') || undefined };
