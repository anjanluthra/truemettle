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
  siteUrl: 'https://truemettle.com',
  personalSiteUrl: 'https://anjanluthra.com',
  personalSiteLabel: 'anjanluthra.com'
};

export const config = {
  port: Number(process.env.PORT || 3000),

  // Canonical origin, used for canonical/OG tags. No trailing slash.
  siteUrl: (process.env.SITE_URL || DEFAULTS.siteUrl).replace(/\/+$/, ''),

  // TBC — the personal site. Empty renders the label as plain text, not a link.
  personalSiteUrl: (process.env.PERSONAL_SITE_URL ?? DEFAULTS.personalSiteUrl).trim(),
  personalSiteLabel: (process.env.PERSONAL_SITE_LABEL || DEFAULTS.personalSiteLabel).trim(),

  /* Vercel's Postgres and Neon integrations both set several of these; take
     whichever is present so the project works with either, unchanged. */
  databaseUrl:
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    '',

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

export const storeConfigured = Boolean(config.databaseUrl);
