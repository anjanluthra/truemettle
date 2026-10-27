import { config } from './config.js';

/* Branded emails to the people who write in: a deck received, a press or
 * speaking request received, a Fifth sign-up. The same build as
 * anjanluthra.com's: tables and inline styles so they hold up in Gmail,
 * Outlook and Apple Mail; Nanum Myeongjo headings and Anjan's sign-off as
 * images (public/email/), since those clients don't load web fonts; Work Sans
 * body falling back to Helvetica; ink on white over the brand sand. */

const ink = '#2F2525';
const muted = '#6b6566';
const sand = '#E7E4D1';
const serif = "'Nanum Myeongjo', Georgia, 'Times New Roman', serif";
const sans = "'Work Sans', Helvetica, Arial, sans-serif";

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

// Images are drawn at twice these sizes for sharp screens.
const SIGNATURE = { src: 'sig-anjan.png', width: 72, height: 41 };
const HEADINGS = {
  deck: { src: 'h-deck.png', width: 251, height: 61 },
  request: { src: 'h-request.png', width: 298, height: 61 },
  subscribed: { src: 'h-subscribed.png', width: 317, height: 61 }
};

const image = (l, alt, style = '') =>
  `<img src="${config.siteUrl}/email/${l.src}" width="${l.width}" height="${l.height}" alt="${esc(alt)}" style="display:block;border:0;width:${l.width}px;max-width:100%;height:auto;${style}">`;

function layout({ preheader, heading, headingImage, paragraphs }) {
  const site = config.siteUrl;
  const paras = paragraphs
    .map((p) => `<p style="margin:0 0 18px;font-family:${sans};font-size:16px;line-height:25px;color:${ink};">${p}</p>`)
    .join('');
  const footLink = (label, href) => `<a href="${href}" style="color:${ink};text-decoration:none;white-space:nowrap;">${label}</a>`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light">
<title>${esc(heading)}</title>
<link href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; background:${sand}; }
  a { color:${ink}; }
  @media (max-width:620px) {
    .px { padding-left:28px !important; padding-right:28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${sand};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${sand};">
<tr><td align="center" style="padding:32px 12px 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td style="line-height:0;font-size:0;">
      <img src="${site}/email/header.jpg" width="600" alt="True Mettle" style="display:block;width:100%;max-width:600px;height:auto;border:0;">
    </td></tr>
    <tr><td class="px" style="background:#ffffff;padding:52px 56px 30px;">
      <h1 style="margin:0 0 26px;font-family:${serif};font-weight:700;font-size:42px;line-height:46px;color:${ink};">${image(headingImage, heading)}</h1>
      ${paras}
      <div style="margin:30px 0 0;">${image(SIGNATURE, 'Anjan')}</div>
    </td></tr>
    <tr><td class="px" style="background:#ffffff;padding:0 56px 44px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="border-top:1px solid #d8d4cd;padding-top:26px;">
          <img src="${site}/email/wordmark.png" width="150" alt="True Mettle" style="display:block;width:150px;height:auto;border:0;">
          <p style="margin:18px 0 0;font-family:${sans};font-size:11px;line-height:18px;letter-spacing:2.4px;text-transform:uppercase;color:${ink};">
            ${footLink('truemettle.co', site)}&nbsp;&nbsp;·&nbsp;&nbsp;${footLink('Anjan Luthra', config.personalSiteUrl || 'https://anjanluthra.com')}
          </p>
        </td>
      </tr></table>
    </td></tr>
    <tr><td align="center" style="padding:22px 24px 0;font-family:${sans};font-size:11px;line-height:17px;color:${muted};">
      True Mettle is Anjan Luthra’s personal investment vehicle. Not a fund.<br>
      Bravecore FZ-LLC, Al Hamra Industrial Zone-FZ, Ras Al Khaimah, UAE.<br>
      You’re receiving this because you signed up or got in touch at truemettle.co.
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || 'there';

const build = ({ subject, preheader, heading, headingImage, lines }) => ({
  subject,
  html: layout({ preheader, heading, headingImage, paragraphs: lines.map(esc) }),
  text: `${lines.join('\n\n')}\n\nAnjan\n\n${config.siteUrl}`
});

export const deckReceived = ({ name, business }) =>
  build({
    subject: 'Deck received',
    preheader: 'Thanks for sending it over. You’ll hear back within 5 working days.',
    heading: 'Deck received.',
    headingImage: HEADINGS.deck,
    lines: [
      `Hi ${firstName(name)},`,
      `Thanks for sending us ${business ? business : 'your deck'}. My team and I read every one, and you’ll hear back within 5 working days, with honest feedback either way.`,
      'If you have anything to add in the meantime, just reply to this email.'
    ]
  });

export const requestReceived = ({ name, business }) =>
  build({
    subject: 'Request received',
    preheader: 'Thanks for getting in touch. We’ll come back to you within 5 working days.',
    heading: 'Request received.',
    headingImage: HEADINGS.request,
    lines: [
      `Hi ${firstName(name)},`,
      `Thanks for getting in touch${business ? ` about ${business}` : ''}. We’ll check my diary and come back to you within 5 working days.`,
      'If you have anything to add in the meantime, just reply to this email.'
    ]
  });

export const subscribed = () =>
  build({
    subject: 'You’re subscribed to Fifth',
    preheader: 'One essay on the 5th of each month. The first one lands on the 5th.',
    heading: 'You’re subscribed.',
    headingImage: HEADINGS.subscribed,
    lines: [
      'Thanks for subscribing to Fifth.',
      'One essay on the 5th of each month, on the lessons I paid for, so you don’t have to. The first one lands on the 5th.',
      'Fifth arrives by email through Substack. If it ever lands in spam, moving it to your inbox makes sure the next one reaches you.'
    ]
  });
