/* Validation and the no-JavaScript response pages. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const LIMITS = {
  name: 120,
  email: 200,
  business: 200,
  revenue: 120,
  situation: 5000
};

const str = (value) => (typeof value === 'string' ? value.trim() : '');

/** Name, email and situation are required; email must look like one. */
export function validateSubmission(raw) {
  const clean = {
    name: str(raw.name).slice(0, LIMITS.name),
    email: str(raw.email).slice(0, LIMITS.email),
    business: str(raw.business).slice(0, LIMITS.business),
    revenue: str(raw.revenue).slice(0, LIMITS.revenue),
    situation: str(raw.situation).slice(0, LIMITS.situation)
  };

  const errors = {};
  if (!clean.name) errors.name = 'Please tell me your name.';
  if (!clean.email) errors.email = 'I need an email address to reply to.';
  else if (!EMAIL.test(clean.email)) errors.email = 'That email address doesn’t look right.';
  if (!clean.situation) errors.situation = 'A line or two about the situation, please.';

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
    heading: 'Thank you — it’s with me.',
    body: 'I read everything myself. If it looks like a fit you’ll hear back from me directly.',
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
