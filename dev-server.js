import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

import { config, mailConfigured, storeConfigured, ROOT } from './src/config.js';
import { renderHtml } from './src/render.js';
import contactHandler from './api/contact.js';

/* Local preview only — production is Vercel, which serves public/ statically
   and runs api/contact.js as a function. This stands in for both so the page
   can be worked on without the Vercel CLI. It is not a deployment target. */

const PUBLIC_DIR = path.join(ROOT, 'public');

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
  '.woff2': 'font/woff2'
};

/* The same headers vercel.json applies in production, so a CSP mistake shows
   up here rather than after a deploy. */
const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; base-uri 'none'; object-src 'none'; frame-ancestors 'none'; " +
    "form-action 'self'; img-src 'self' data:; font-src 'self'; style-src 'self'; " +
    "script-src 'self'; connect-src 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()'
};

/** Minimal stand-in for the request/response shape Vercel hands a function. */
function adapt(req, res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.send = (body) => {
    res.end(body);
    return res;
  };
  return [req, res];
}

const server = http.createServer(async (req, res) => {
  for (const [header, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(header, value);

  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }

  if (pathname === '/api/contact') {
    try {
      await contactHandler(...adapt(req, res));
    } catch (error) {
      console.error('[dev] handler threw:', error);
      if (!res.headersSent) res.writeHead(500).end('Server error');
    }
    return;
  }

  const route = pathname === '/' ? '/index.html' : pathname;
  const file = path.join(PUBLIC_DIR, route);

  // Keep the preview inside public/.
  if (!file.startsWith(PUBLIC_DIR) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderHtml(fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8')));
    return;
  }

  const ext = path.extname(file).toLowerCase();
  let body = fs.readFileSync(file);
  // Read from disk each time so edits show up on refresh.
  if (route === '/index.html') body = Buffer.from(renderHtml(body.toString('utf8')), 'utf8');

  res.writeHead(200, {
    'Content-Type': TYPES[ext] || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': body.length
  });
  res.end(req.method === 'HEAD' ? undefined : body);
});

server.listen(config.port, () => {
  console.info('True Mettle (local preview) — http://localhost:%d', config.port);
  console.info('  store  %s', storeConfigured ? 'TiDB' : 'not configured');
  console.info('  mail   %s', mailConfigured ? `→ ${config.mail.to}` : 'not configured');
  if (!storeConfigured && !mailConfigured) {
    console.info('  note   the form will answer 503 until one of those is set');
  }
});
