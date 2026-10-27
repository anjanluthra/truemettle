/* Validation and the no-JavaScript response pages. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
  name: 120,
  email: 200,
  business: 200,
  website: 300,
  revenue: 120,
  location: 160,
  audience: 120,
  situation: 5000
};

/* The answers each route offers, exactly as the form shows them. Anything
   else that arrives is dropped rather than stored. */
export const CHOICES = {
  sector: ['Sport & Fitness', 'Media & Entertainment', 'Digital Services', 'Live Events & Experiences', 'Other'],
  trading: ['Less than 2 years', '2 to 5 years', 'More than 5 years'],
  profitable: ['Yes', 'Not yet'],
  requestType: ['Press interview', 'Keynote', 'Panel', 'Fireside chat', 'Podcast', 'Other']
};

const str = (value) => (typeof value === 'string' ? value.trim() : '');
const list = (value, allowed) =>
  [].concat(value ?? []).map(str).filter((item) => allowed.includes(item));
const one = (value, allowed) => list(value, allowed)[0] || '';

// Decks are uploaded straight to Vercel Blob by the browser; only accept a
// link that points there.
const deckUrl = (value) => {
  const url = str(value);
  return /^https:\/\/[a-z0-9-]+\.public\.blob\.vercel-storage\.com\/decks\//i.test(url) && url.length <= 600
    ? url
    : '';
};

/**
 * Two routes share the endpoint: `pitch` (send your deck) and `press`
 * (press & speaking). Name and email are always required; the rest depends
 * on the route. Route-specific answers travel in `details`.
 */
export function validateSubmission(raw) {
  const kind = str(raw.kind) === 'press' ? 'press' : 'pitch';
  const errors = {};

  const clean = {
    kind,
    name: str(raw.name).slice(0, LIMITS.name),
    email: str(raw.email).slice(0, LIMITS.email),
    business: '',
    revenue: '',
    situation: str(raw.situation).slice(0, LIMITS.situation),
    deckUrl: '',
    details: {}
  };

  if (!clean.name) errors.name = 'Please tell us your name.';
  if (!clean.email) errors.email = 'We need an email address to reply to.';
  else if (!EMAIL.test(clean.email)) errors.email = 'That email address doesn’t look right.';

  if (kind === 'pitch') {
    clean.business = str(raw.company).slice(0, LIMITS.business);
    clean.revenue = str(raw.revenue).slice(0, LIMITS.revenue);
    clean.deckUrl = deckUrl(raw.deck_url);
    clean.details = {
      website: str(raw.website).slice(0, LIMITS.website),
      sector: list(raw.sector, CHOICES.sector),
      trading: one(raw.trading, CHOICES.trading),
      profitable: one(raw.profitable, CHOICES.profitable)
    };
    if (!clean.business) errors.company = 'Which company is this?';
    if (!clean.details.sector.length) errors.sector = 'Pick at least one sector.';
    if (!clean.details.trading) errors.trading = 'How long have you been trading?';
    if (!clean.details.profitable) errors.profitable = 'Is the business profitable yet?';
    if (!clean.situation && !clean.deckUrl) {
      errors.situation = 'Upload your deck, or tell us in a few lines.';
    }
  } else {
    clean.business = str(raw.organisation).slice(0, LIMITS.business);
    clean.details = {
      requestType: one(raw.request_type, CHOICES.requestType),
      location: str(raw.location).slice(0, LIMITS.location),
      audience: str(raw.audience).slice(0, LIMITS.audience)
    };
    if (!clean.business) errors.organisation = 'Which organisation or publication?';
    if (!clean.details.requestType) errors.request_type = 'What kind of request is it?';
    if (!clean.situation) errors.situation = 'Tell us a little about the opportunity.';
  }

  return { clean, errors, valid: Object.keys(errors).length === 0 };
}

/**
 * Honeypot filled, or the form completed faster than a human could read it.
 * There is deliberately no upper time bound: someone who opens the page, gets
 * pulled away and sends it the next morning is exactly who this site is for.
 */
export function looksAutomated(raw) {
  if (str(raw.company_website)) return true;

  const startedAt = Number(raw.started_at);
  if (Number.isFinite(startedAt) && startedAt > 0 && Date.now() - startedAt < 2500) {
    return true;
  }
  return false;
}

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

/* Served only to browsers without JavaScript; everyone else stays on the page. */
export function resultPage({ title, heading, body, action }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} — True Mettle</title>
<meta name="robots" content="noindex">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="result-page">
<main class="result">
  <div class="shell result__inner">
    <p class="wordmark">True&nbsp;Mettle</p>
    <p class="sent__mark" aria-hidden="true">✦</p>
    <h1 class="result__heading">${escapeHtml(heading)}</h1>
    <p class="result__body">${escapeHtml(body)}</p>
    <p class="result__actions">${action}</p>
  </div>
</main>
</body>
</html>`;
}

export function successPage() {
  return resultPage({
    title: 'Thank you',
    heading: 'Thank you — it’s with us.',
    body: 'Anjan’s team reads every one. You’ll hear back within 5 working days.',
    action: '<a href="/">Back to True Mettle</a>'
  });
}

export function errorPage(errors) {
  const list = Object.values(errors).join(' ');
  return resultPage({
    title: 'Not sent',
    heading: 'That didn’t go through.',
    body: `${list} Press back in your browser — everything you wrote is still in the form.`,
    action: '<a href="/#contact">Back to the form</a>'
  });
}
