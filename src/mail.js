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

function plainBody(s) {
  const lines = [
    `Name:      ${s.name}`,
    `Email:     ${s.email}`,
    `Business:  ${s.business || '—'}`,
    `Turnover:  ${s.revenue || '—'}`,
    '',
    'Situation',
    '─────────',
    s.situation,
    '',
    '─────────',
    `Received:  ${new Date().toUTCString()}`
  ];
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
      subject: `${config.mail.subjectPrefix}: ${submission.name}${
        submission.business ? ` — ${submission.business}` : ''
      }`,
      text: plainBody(submission)
    });
    return { ok: true };
  } catch (error) {
    console.error('[mail] send failed:', error.message);
    return { ok: false, error: error.message };
  }
}
