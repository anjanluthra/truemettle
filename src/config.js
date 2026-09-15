import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* A five-line .env reader, so the project keeps its single dependency. */
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

loadDotEnv();

const bool = (value, fallback = false) =>
  value === undefined ? fallback : /^(1|true|yes|on)$/i.test(value);

/* The values baked into public/index.html, so a static host serving that file
   straight off disk gets a correct page. The server rewrites them only when
   the environment asks for something else. */
export const DEFAULTS = {
  siteUrl: 'https://truemettle.com',
  personalSiteUrl: 'https://anjanluthra.com',
  personalSiteLabel: 'anjanluthra.com'
};

export const config = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  trustProxy: bool(process.env.TRUST_PROXY, false),

  // Canonical origin, used for canonical/OG tags. No trailing slash.
  siteUrl: (process.env.SITE_URL || DEFAULTS.siteUrl).replace(/\/+$/, ''),

  // TBC — the personal site. Empty renders the label as plain text, not a link.
  personalSiteUrl: (process.env.PERSONAL_SITE_URL ?? DEFAULTS.personalSiteUrl).trim(),
  personalSiteLabel: (process.env.PERSONAL_SITE_LABEL || DEFAULTS.personalSiteLabel).trim(),

  databasePath: process.env.DATABASE_PATH || path.join(ROOT, 'data', 'submissions.db'),
  overflowLogPath: process.env.OVERFLOW_LOG_PATH || path.join(ROOT, 'data', 'submissions.jsonl'),

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
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 60 * 60 * 1000)
  }
};

export const mailConfigured = Boolean(
  config.mail.to && config.mail.from && config.mail.smtp.host
);
