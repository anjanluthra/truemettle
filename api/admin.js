import crypto from 'node:crypto';
import { storeConfigured } from '../src/config.js';
import { listAll } from '../src/store.js';

/* GET /api/admin — a password-protected view of every enquiry and newsletter
 * sign-up, with CSV export.
 *
 *   /api/admin                          the tables
 *   /api/admin?export=submissions       CSV of enquiries
 *   /api/admin?export=subscribers       CSV of sign-ups
 *
 * HTTP Basic auth; any username, password = ADMIN_PASSWORD. With no
 * ADMIN_PASSWORD set the page does not exist.
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

function authorised(req) {
  const expected = process.env.ADMIN_PASSWORD || '';
  if (!expected) return false;

  const header = String(req.headers.authorization || '');
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const given = decoded.slice(decoded.indexOf(':') + 1);

  // Compare digests so the comparison is constant-time whatever the lengths.
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
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
  <td>${s.deck_url ? `<a href="${escapeHtml(s.deck_url)}" rel="noopener noreferrer" target="_blank">Open PDF</a>` : ''}</td>
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
<link rel="stylesheet" href="/admin.css">
</head>
<body>
<main>
  <h1>True Mettle — admin</h1>

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');

  if (!process.env.ADMIN_PASSWORD) {
    res.status(404).send('Not found');
    return;
  }

  if (!authorised(req)) {
    res.setHeader('WWW-Authenticate', 'Basic realm="True Mettle admin", charset="UTF-8"');
    res.status(401).send('Authentication required');
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    res.status(405).send('Method not allowed');
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

  const exportKind = new URL(req.url, 'http://localhost').searchParams.get('export');
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
