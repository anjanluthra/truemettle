import { config, mailConfigured } from './config.js';

/* Nodemailer is loaded lazily so the site still boots — and still captures
   enquiries — on a box where SMTP was never configured. */
let transportPromise = null;

function getTransport() {
  if (!transportPromise) {
    transportPromise = import('nodemailer').then(({ default: nodemailer }) =>
      nodemailer.createTransport({
        host: config.mail.smtp.host,
        port: config.mail.smtp.port,
        secure: config.mail.smtp.secure,
        auth: config.mail.smtp.user
          ? { user: config.mail.smtp.user, pass: config.mail.smtp.pass }
          : undefined
      })
    );
  }
  return transportPromise;
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
          `Deck:        ${s.deckUrl || 'not uploaded'}`,
          '',
          'In their words',
          '──────────────',
          s.situation || '—'
        ];
  lines.push('', '─────────', `Received:  ${new Date().toUTCString()}`);
  if (s.ip) lines.push(`From:      ${s.ip}`);
  return lines.join('\n');
}

/** Send the notification. Resolves either way — the caller logs the outcome. */
export async function sendNotification(submission) {
  if (!mailConfigured) {
    console.info(
      '[mail] SMTP not configured — enquiry stored only.\n%s',
      plainBody(submission)
    );
    return { ok: false, error: 'smtp_not_configured' };
  }

  try {
    const transport = await getTransport();
    await transport.sendMail({
      to: config.mail.to,
      from: config.mail.from,
      replyTo: `${submission.name} <${submission.email}>`,
      subject: `${config.mail.subjectPrefix} ${submission.kind === 'press' ? 'press request' : 'deck'}: ${
        submission.name
      }${submission.business ? ` — ${submission.business}` : ''}`,
      text: plainBody(submission)
    });
    return { ok: true };
  } catch (error) {
    console.error('[mail] send failed:', error.message);
    return { ok: false, error: error.message };
  }
}
