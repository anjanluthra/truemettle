import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

import { config, mailConfigured, ROOT, DEFAULTS } from './src/config.js';
import { openStore, saveSubmission, recordEmailResult, closeStore } from './src/store.js';
import { sendNotification } from './src/mail.js';
import {
  validateSubmission,
  looksAutomated,
  successPage,
  errorPage
} from './src/contact.js';

const PUBLIC_DIR = path.join(ROOT, 'public');
const MAX_BODY_BYTES = 64 * 1024;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
  '.xml': 'application/xml; charset=utf-8'
};

const COMPRESSIBLE = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml']);
const IMMUTABLE = new Set(['.woff2']);

/* ── Templating ───────────────────────────────────────────────────────────────
   public/index.html is a complete, correct page on its own — it carries real
   defaults, not placeholders, so a static host can serve it untouched. What
   follows rewrites those defaults once at boot when the environment differs,
   which is why it substitutes values rather than filling in blanks.
   ────────────────────────────────────────────────────────────────────────── */
const PERSONAL_LINK_REGION = /<!--personal-link-->[\s\S]*?<!--\/personal-link-->/;

function personalLink() {
  const label = escapeHtml(config.personalSiteLabel);
  const inner = config.personalSiteUrl
    ? `<a href="${escapeHtml(config.personalSiteUrl)}" rel="noopener">${label}</a>`
    : `<span class="tbc">${label}</span>`;
  return `<!--personal-link-->${inner}<!--/personal-link-->`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function render(html) {
  let out = html;

  if (config.siteUrl !== DEFAULTS.siteUrl) {
    out = out.replaceAll(DEFAULTS.siteUrl, escapeHtml(config.siteUrl));
  }

  if (
    config.personalSiteUrl !== DEFAULTS.personalSiteUrl ||
    config.personalSiteLabel !== DEFAULTS.personalSiteLabel
  ) {
    out = out.replace(PERSONAL_LINK_REGION, personalLink());
  }

  return out;
}

/* ── Static assets, read and compressed once ─────────────────────────────── */
const assets = new Map();

function loadAssets(dir = PUBLIC_DIR, prefix = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    const route = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      loadAssets(full, route);
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    let body = fs.readFileSync(full);
    if (route === '/index.html') body = Buffer.from(render(body.toString('utf8')), 'utf8');

    const asset = {
      body,
      type: TYPES[ext] || 'application/octet-stream',
      etag: `"${crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20)}"`,
      cache: IMMUTABLE.has(ext)
        ? 'public, max-age=31536000, immutable'
        : ext === '.html'
          ? 'no-cache'
          : 'public, max-age=600, must-revalidate'
    };

    if (COMPRESSIBLE.has(ext) && body.length > 512) {
      asset.br = zlib.brotliCompressSync(body, {
        params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 }
      });
      asset.gzip = zlib.gzipSync(body, { level: 9 });
    }

    assets.set(route, asset);
  }
}

function sendAsset(req, res, asset, status = 200) {
  const headers = {
    'Content-Type': asset.type,
    'Cache-Control': asset.cache,
    ETag: asset.etag,
    Vary: 'Accept-Encoding'
  };

  if (req.headers['if-none-match'] === asset.etag) {
    res.writeHead(304, headers);
    res.end();
    return;
  }

  const accepted = String(req.headers['accept-encoding'] || '');
  let body = asset.body;
  if (asset.br && /\bbr\b/.test(accepted)) {
    body = asset.br;
    headers['Content-Encoding'] = 'br';
  } else if (asset.gzip && /\bgzip\b/.test(accepted)) {
    body = asset.gzip;
    headers['Content-Encoding'] = 'gzip';
  }

  headers['Content-Length'] = body.length;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

/* ── Rate limiting: enough to blunt a script, invisible to a person ──────── */
const hits = new Map();

function clientIp(req) {
  if (config.trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return String(forwarded).split(',')[0].trim();
  }
  return req.socket.remoteAddress || '';
}

function rateLimited(ip) {
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((at) => now - at < config.rateLimit.windowMs);
  if (recent.length >= config.rateLimit.max) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.clear();
  return false;
}

/* ── Request body ─────────────────────────────────────────────────────────── */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function parseBody(raw, contentType = '') {
  if (contentType.includes('application/json')) {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return Object.fromEntries(new URLSearchParams(raw));
}

const wantsJson = (req) =>
  String(req.headers.accept || '').includes('application/json') ||
  String(req.headers['content-type'] || '').includes('application/json');

function sendJson(res, status, payload) {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length
  });
  res.end(body);
}

function sendHtml(res, status, html) {
  const body = Buffer.from(html, 'utf8');
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length
  });
  res.end(body);
}

/* ── POST /api/contact ────────────────────────────────────────────────────── */
async function handleContact(req, res) {
  const json = wantsJson(req);
  const ip = clientIp(req);

  if (rateLimited(ip)) {
    const message = 'That’s a few messages in a short space of time — try again a little later.';
    return json
      ? sendJson(res, 429, { ok: false, message })
      : sendHtml(res, 429, errorPage({ rate: message }));
  }

  let raw;
  try {
    raw = await readBody(req);
  } catch (error) {
    const message = 'That message was too long to accept.';
    return json
      ? sendJson(res, error.statusCode || 400, { ok: false, message })
      : sendHtml(res, error.statusCode || 400, errorPage({ body: message }));
  }

  const values = parseBody(raw, req.headers['content-type']);
  const { clean, errors, valid } = validateSubmission(values);

  // Anything tripping the spam checks is stored flagged and never emailed —
  // a bot gets the ordinary thank-you and learns nothing, and the rare false
  // positive is still sitting in the table rather than gone.
  const spam = looksAutomated(values);

  if (!spam && !valid) {
    return json
      ? sendJson(res, 422, { ok: false, errors })
      : sendHtml(res, 422, errorPage(errors));
  }

  const submission = {
    ...clean,
    spam,
    ip,
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300)
  };

  let id = null;
  try {
    id = saveSubmission(submission);
  } catch (error) {
    // Storage is the safety net; if it fails outright, say so rather than
    // showing a thank-you for an enquiry nobody will ever read.
    console.error('[contact] could not persist submission:', error);
    const message = 'Something went wrong at my end — nothing was sent. Please try again.';
    return json
      ? sendJson(res, 500, { ok: false, message })
      : sendHtml(res, 500, errorPage({ server: message }));
  }

  // Stored safely, so the reply goes out now and the email follows behind it.
  if (json) sendJson(res, 200, { ok: true });
  else sendHtml(res, 200, successPage());

  if (spam) {
    console.info('[contact] #%s flagged as automated — stored, not emailed', id ?? 'jsonl');
    return;
  }

  const result = await sendNotification(submission);
  recordEmailResult(id, result.ok, result.error);
  console.info(
    '[contact] #%s from %s — email %s',
    id ?? 'jsonl',
    submission.email,
    result.ok ? 'sent' : `not sent (${result.error})`
  );
}

/* ── Server ───────────────────────────────────────────────────────────────── */
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; " +
    "form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; " +
    "script-src 'self'; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
  'Cross-Origin-Opener-Policy': 'same-origin'
};

const server = http.createServer(async (req, res) => {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(header, value);

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (req.method === 'POST' && pathname === '/api/contact') {
    try {
      await handleContact(req, res);
    } catch (error) {
      console.error('[contact] unhandled:', error);
      if (!res.headersSent) sendJson(res, 500, { ok: false, message: 'Server error.' });
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD, POST' }).end('Method not allowed');
    return;
  }

  if (pathname === '/health') {
    sendJson(res, 200, { ok: true, mail: mailConfigured ? 'configured' : 'not configured' });
    return;
  }

  const route = pathname === '/' ? '/index.html' : pathname.replace(/\/$/, '');
  const asset = assets.get(route);
  if (asset) {
    sendAsset(req, res, asset);
    return;
  }

  // One page, so anything else is simply not here.
  sendAsset(req, res, assets.get('/index.html'), 404);
});

const store = await openStore();
loadAssets();

server.listen(config.port, config.host, () => {
  console.info('True Mettle — http://localhost:%d', config.port);
  console.info('  assets  %d files from %s', assets.size, PUBLIC_DIR);
  console.info('  store   %s → %s', store.driver, store.path);
  console.info('  mail    %s', mailConfigured ? `→ ${config.mail.to}` : 'not configured (stored only)');
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    server.close(() => {
      closeStore();
      process.exit(0);
    });
  });
}
