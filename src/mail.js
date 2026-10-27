import { config, mailConfigured } from './config.js';
import { deckLink } from './decks.js';
import { deckReceived, requestReceived, subscribed } from './emails.js';

/* Email via Resend (https://resend.com), as on anjanluthra.com: an alert to
   the team (NOTIFY_EMAIL) for each enquiry and sign-up, and a branded
   confirmation to the person who wrote in (src/emails.js). Both come from
   NOTIFY_FROM, which must be on a domain verified in Resend. Off until
   RESEND_API_KEY is set; the enquiry is in the database either way. */

async function send(payload) {
  if (!mailConfigured) return { ok: false, error: 'resend_not_configured' };
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.mail.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: config.mail.from, ...payload })
    });
    if (res.ok) return { ok: true };
    const error = `resend ${res.status}: ${(await res.text()).slice(0, 300)}`;
    console.error('[mail] send failed:', error);
    return { ok: false, error };
  } catch (error) {
    console.error('[mail] send failed:', error.message);
    return { ok: false, error: error.message };
  }
}

const yes = (value) => (Array.isArray(value) ? value.join(', ') : value) || '—';

function plainBody(s) {
  const d = s.details || {};
  const lines =
    s.kind === 'press'
      ? [
          'PRESS & SPEAKING REQUEST',
          '',
          `Name:          ${s.name}`,
          `Email:         ${s.email}`,
          `Organisation:  ${s.business || '—'}`,
          `What:          ${yes(d.requestType)}`,
          `Location:      ${yes(d.location)}`,
          `Audience:      ${yes(d.audience)}`,
          '',
          'The details',
          '───────────',
          s.situation
        ]
      : [
          'PITCH: SEND YOUR DECK',
          '',
          `Name:        ${s.name}`,
          `Email:       ${s.email}`,
          `Company:     ${s.business || '—'}`,
          `Website:     ${yes(d.website)}`,
          `Sector:      ${yes(d.sector)}`,
          `Trading:     ${yes(d.trading)}`,
          `Profitable:  ${yes(d.profitable)}`,
          `Revenue:     ${s.revenue || '—'}`,
          `Deck:        ${s.deckUrl ? deckLink(s.deckUrl) : 'not uploaded'}`,
          '',
          'In their words',
          '──────────────',
          s.situation || '—'
        ];
  lines.push('', '─────────', `Received:  ${new Date().toUTCString()}`);
  if (s.ip) lines.push(`From:      ${s.ip}`);
  return lines.join('\n');
}

/** The alert to the team. Resolves either way; the caller logs the outcome. */
export async function sendNotification(submission) {
  if (!mailConfigured) {
    console.info('[mail] Resend not configured — enquiry stored only.\n%s', plainBody(submission));
    return { ok: false, error: 'resend_not_configured' };
  }
  return send({
    to: config.mail.to,
    reply_to: `${submission.name} <${submission.email}>`,
    subject: `${config.mail.subjectPrefix} ${submission.kind === 'press' ? 'press request' : 'deck'}: ${
      submission.name
    }${submission.business ? ` — ${submission.business}` : ''}`,
    text: plainBody(submission)
  });
}

/** The branded "received" email to the person who sent the enquiry. */
export function sendConfirmation(submission) {
  const email = submission.kind === 'press' ? requestReceived(submission) : deckReceived(submission);
  return send({ to: submission.email, reply_to: config.mail.replyTo, ...email });
}

/** A new Fifth sign-up: the alert to the team, then the welcome. */
export async function sendSubscriberEmails(address) {
  await send({
    to: config.mail.to,
    subject: `${config.mail.subjectPrefix} new Fifth subscriber: ${address}`,
    text: `New Fifth subscriber: ${address}\n\nAdd them in Substack from the /admin CSV.`
  });
  return send({ to: address, reply_to: config.mail.replyTo, ...subscribed() });
}
