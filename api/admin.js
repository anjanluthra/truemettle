import crypto from 'node:crypto';
import { blobAuth, storeConfigured } from '../src/config.js';
import { listAll } from '../src/store.js';
import { cleanDeckUrl, deckLink, isPublicDeck } from '../src/decks.js';
import { parseBody } from '../src/http.js';

/* GET /api/admin — a password-protected view of every enquiry and newsletter
 * sign-up, with CSV export.
 *
 *   /api/admin                          the tables
 *   /api/admin?export=submissions       CSV of enquiries
 *   /api/admin?export=subscribers       CSV of sign-ups
 *   /api/admin?deck=<blob url>          one uploaded deck, streamed from a
 *                                       private Blob store
 *
 *   /api/admin?logout=1                 signs out
 *
 * Signing in is a password-only form (password = ADMIN_PASSWORD) that sets a
 * signed, HttpOnly session cookie. With no ADMIN_PASSWORD set the page does
 * not exist.
 */

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

const when = (value) => (value instanceof Date ? value.toISOString().replace('T', ' ').slice(0, 16) : String(value ?? ''));

const COOKIE = 'tm_admin';
const SESSION_DAYS = 14;

// Compare digests so the comparison is constant-time whatever the lengths.
const same = (a, b) =>
  crypto.timingSafeEqual(crypto.createHash('sha256').update(a).digest(), crypto.createHash('sha256').update(b).digest());

// The session is "<expiry>.<hmac>", keyed on the password itself, so changing
// ADMIN_PASSWORD signs everyone out.
const sign = (expires) => crypto.createHmac('sha256', process.env.ADMIN_PASSWORD).update(`admin:${expires}`).digest('base64url');

function signedIn(req) {
  const match = String(req.headers.cookie || '').match(/(?:^|;\s*)tm_admin=([^;]+)/);
  if (!match) return false;
  const [expires, mac] = match[1].split('.');
  return Number(expires) > Date.now() && same(String(mac || ''), sign(expires));
}

function setSession(res) {
  const expires = Date.now() + SESSION_DAYS * 86_400_000;
  res.setHeader('Set-Cookie', `${COOKIE}=${expires}.${sign(expires)}; Path=/; Max-Age=${SESSION_DAYS * 86_400}; HttpOnly; Secure; SameSite=Lax`);
}

const clearSession = (res) => res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);

// Back to the page that asked for a sign-in: only ever /admin itself, keeping
// a ?deck= so a deck link opened while signed out still lands on the deck.
function backTo(params) {
  const deck = params.get('deck');
  return deck ? `/admin?deck=${encodeURIComponent(deck)}` : '/admin';
}

const SLIDES = [
  { name: 'live', widths: [400, 800, 1200] },
  { name: 'sport', widths: [400, 800, 1125] },
  { name: 'hero', widths: [720, 1080, 1440, 2000] }
];

const slide = ({ name, widths }, i) => {
  const set = (ext) => widths.map((w) => `/img/${name}-${w}.${ext} ${w}w`).join(', ');
  const mid = widths[Math.min(1, widths.length - 1)];
  return `<picture class="login__slide login__slide--${name}${i === 0 ? ' is-active' : ''}">
      <source type="image/avif" srcset="${set('avif')}" sizes="(max-width: 47.9375rem) 100vw, 58vw">
      <img src="/img/${name}-${mid}.webp" srcset="${set('webp')}" sizes="(max-width: 47.9375rem) 100vw, 58vw" alt=""${i === 0 ? ' fetchpriority="high"' : ' loading="lazy"'}>
    </picture>`;
};

const ARROW = '<svg viewBox="0 0 24 12" aria-hidden="true"><path d="M0 6h22M17 1l5 5-5 5"/></svg>';

function loginPage({ action, error }) {
  const year = new Date().getFullYear();
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Sign in — True Mettle</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="preload" href="/fonts/nanummyeongjo-800-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/admin.css">
</head>
<body class="login">
<main class="login__layout">
  <section class="login__visual" aria-hidden="true">
    ${SLIDES.map(slide).join('\n    ')}
    <a class="login__wordmark" href="/" tabindex="-1"><img src="/brand/wordmark.svg" width="1287" height="229" alt=""></a>
    <div class="login__caption">
      <p class="login__eyebrow">Personal investment company</p>
      <p class="login__headline">Backing the resilient.</p>
    </div>
    <div class="login__dots">${SLIDES.map((_, i) => `<span${i === 0 ? ' class="is-active"' : ''}></span>`).join('')}</div>
  </section>

  <section class="login__panel">
    <header class="login__top">
      <a href="/" aria-label="True Mettle — home"><img class="login__mark" src="/brand/monogram-ink.svg" width="50" height="37" alt=""></a>
      <span class="login__label">Private</span>
    </header>

    <form class="login__form" method="post" action="${escapeHtml(action)}" novalidate>
      <p class="login__kicker">Admin</p>
      <h1 class="login__title">Welcome back.</h1>
      <p class="login__lede">Decks, press requests and Fifth sign-ups, in one place.</p>

      <label class="login__field-label" for="password">Password</label>
      <div class="login__field${error ? ' is-invalid' : ''}">
        <input id="password" name="password" type="password" autocomplete="current-password" required autofocus${error ? ' aria-invalid="true" aria-describedby="login-error"' : ''}>
        <button class="login__show" type="button" aria-controls="password" aria-pressed="false" hidden>Show</button>
      </div>
      ${error ? `<p class="login__error" id="login-error" role="alert">${escapeHtml(error)}</p>` : ''}

      <button class="login__submit" type="submit"><span>Sign in</span>${ARROW}</button>
    </form>

    <footer class="login__foot">
      <a href="/"><svg viewBox="0 0 24 12" aria-hidden="true"><path d="M24 6H2M7 1L2 6l5 5"/></svg>truemettle.co</a>
      <span>&copy; True Mettle ${year}</span>
    </footer>
  </section>
</main>
<script src="/admin-login.js"></script>
</body>
</html>`;
}

// Leading = + - @ would be read as a formula by a spreadsheet.
const csvCell = (value) => {
  let text = value instanceof Date ? value.toISOString() : String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

function toCsv(rows, columns) {
  return [columns.join(','), ...rows.map((row) => columns.map((c) => csvCell(row[c])).join(','))].join('\r\n');
}

const SUBMISSION_COLUMNS = ['id', 'received_at', 'kind', 'name', 'email', 'business', 'revenue', 'details', 'deck_url', 'situation', 'emailed', 'email_error', 'spam'];

const KIND = { pitch: 'Deck', press: 'Press' };

// details is stored as JSON; show it as "Sector: Sport & Fitness · Trading: …".
const LABELS = { website: 'Website', sector: 'Sector', trading: 'Trading', profitable: 'Profitable', requestType: 'What', location: 'Location', audience: 'Audience' };
function detailsText(raw) {
  let d;
  try { d = JSON.parse(raw || '{}'); } catch { return ''; }
  return Object.entries(d)
    .filter(([, v]) => (Array.isArray(v) ? v.length : v))
    .map(([k, v]) => `${LABELS[k] || k}: ${Array.isArray(v) ? v.join(', ') : v}`)
    .join(' · ');
}
const SUBSCRIBER_COLUMNS = ['id', 'subscribed_at', 'email', 'spam'];

function page({ submissions, subscribers }) {
  const real = (rows) => rows.filter((row) => !row.spam);
  const flag = (row) => (row.spam ? ' class="is-spam"' : '');

  const submissionRows = submissions
    .map(
      (s) => `<tr${flag(s)}>
  <td class="nowrap">${escapeHtml(when(s.received_at))}</td>
  <td>${escapeHtml(KIND[s.kind] || 'Deck')}</td>
  <td>${escapeHtml(s.name)}</td>
  <td><a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a></td>
  <td>${escapeHtml(s.business)}</td>
  <td>${escapeHtml(s.revenue)}</td>
  <td class="wrap">${escapeHtml(detailsText(s.details))}</td>
  <td>${s.deck_url ? `<a href="${escapeHtml(deckLink(s.deck_url, ''))}" rel="noopener noreferrer" target="_blank">Open PDF</a>` : ''}</td>
  <td class="wrap">${escapeHtml(s.situation)}</td>
  <td>${s.spam ? 'spam' : s.emailed ? 'emailed' : `<span title="${escapeHtml(s.email_error)}">not emailed</span>`}</td>
</tr>`
    )
    .join('\n');

  const subscriberRows = subscribers
    .map(
      (s) => `<tr${flag(s)}>
  <td class="nowrap">${escapeHtml(when(s.subscribed_at))}</td>
  <td><a href="mailto:${escapeHtml(s.email)}">${escapeHtml(s.email)}</a></td>
  <td>${s.spam ? 'spam' : ''}</td>
</tr>`
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>Admin — True Mettle</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/admin.css">
</head>
<body class="tables">
<main>
  <div class="tables__top">
    <h1><img src="/brand/monogram-ink.svg" width="50" height="37" alt="">Admin</h1>
    <a href="?logout=1">Sign out</a>
  </div>

  <section>
    <header>
      <h2>Decks &amp; requests <small>${real(submissions).length}</small></h2>
      <a href="?export=submissions">Download CSV</a>
    </header>
    ${
      submissions.length
        ? `<div class="scroll"><table>
<thead><tr><th>Received (UTC)</th><th>Type</th><th>Name</th><th>Email</th><th>Company / organisation</th><th>Revenue</th><th>Answers</th><th>Deck</th><th>In their words</th><th>Status</th></tr></thead>
<tbody>
${submissionRows}
</tbody></table></div>`
        : '<p class="empty">No enquiries yet.</p>'
    }
  </section>

  <section>
    <header>
      <h2>Newsletter sign-ups <small>${real(subscribers).length}</small></h2>
      <a href="?export=subscribers">Download CSV</a>
    </header>
    ${
      subscribers.length
        ? `<div class="scroll"><table>
<thead><tr><th>Signed up (UTC)</th><th>Email</th><th></th></tr></thead>
<tbody>
${subscriberRows}
</tbody></table></div>`
        : '<p class="empty">No sign-ups yet.</p>'
    }
  </section>

  <p class="note">Rows flagged as spam are greyed out and left out of the counts.</p>
</main>
</body>
</html>`;
}

async function sendDeck(req, res, value) {
  const url = cleanDeckUrl(value);
  if (!url) {
    res.status(400).send('Not a deck link.');
    return;
  }
  try {
    const { get } = await import('@vercel/blob');
    const result = await get(url, { access: isPublicDeck(url) ? 'public' : 'private', ...blobAuth(req) });
    if (!result || result.statusCode !== 200) {
      res.status(404).send('That deck is no longer in storage.');
      return;
    }
    const { Readable } = await import('node:stream');
    const name = (url.split('/').pop() || 'deck.pdf').replace(/[^\w.-]+/g, '_');
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    res.status(200);
    Readable.fromWeb(result.stream).pipe(res);
  } catch (error) {
    console.error('[admin] could not fetch deck:', error.message);
    res.status(502).send('Could not fetch that deck.');
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!process.env.ADMIN_PASSWORD) {
    res.status(404).send('Not found');
    return;
  }

  const params = new URL(req.url, 'http://localhost').searchParams;

  if (params.has('logout')) {
    clearSession(res);
    res.setHeader('Location', '/admin');
    res.status(303).send('');
    return;
  }

  if (req.method === 'POST') {
    let password = '';
    try {
      password = String((await parseBody(req)).password ?? '');
    } catch {
      // An oversized body is just a wrong password.
    }
    if (password && same(password, process.env.ADMIN_PASSWORD)) {
      setSession(res);
      res.setHeader('Location', backTo(params));
      res.status(303).send('');
      return;
    }
    // A short pause makes guessing slow without bothering a person.
    await new Promise((resolve) => setTimeout(resolve, 800));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(401).send(loginPage({ action: backTo(params), error: password ? 'That password isn’t right.' : 'Enter the password.' }));
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).send('Method not allowed');
    return;
  }

  if (!signedIn(req)) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(loginPage({ action: backTo(params) }));
    return;
  }

  // A deck in the private Blob store: only the store's token can read it, so
  // it is streamed through here, behind the same password.
  const deckParam = params.get('deck');
  if (deckParam !== null) {
    await sendDeck(req, res, deckParam);
    return;
  }

  if (!storeConfigured) {
    res.status(503).send('No database configured (DATABASE_URL).');
    return;
  }

  let data;
  try {
    data = await listAll();
  } catch (error) {
    console.error('[admin] could not read the database:', error);
    res.status(500).send('Could not read the database.');
    return;
  }

  const exportKind = params.get('export');
  if (exportKind === 'submissions' || exportKind === 'subscribers') {
    const csv =
      exportKind === 'submissions'
        ? toCsv(data.submissions, SUBMISSION_COLUMNS)
        : toCsv(data.subscribers, SUBSCRIBER_COLUMNS);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="truemettle-${exportKind}-${stamp}.csv"`);
    res.status(200).send(`﻿${csv}`);
    return;
  }

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(200).send(page(data));
}
