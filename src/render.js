import { config, DEFAULTS } from './config.js';

/* public/index.html is a complete, correct page on its own — it carries real
   default URLs, not placeholders, so a static host can serve it untouched.
   This rewrites those defaults in place, and only when the environment asks
   for something different. Run at build time by tools/build.js. */

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

export function renderHtml(html) {
  let out = html;

  if (config.siteUrl !== DEFAULTS.siteUrl) {
    out = out.replaceAll(DEFAULTS.siteUrl, escapeHtml(config.siteUrl));
  }

  // Every link to the personal site. Empty drops the href, which leaves the
  // label in place as plain text.
  if (config.personalSiteUrl !== DEFAULTS.personalSiteUrl) {
    out = out.replaceAll(
      ` href="${DEFAULTS.personalSiteUrl}"`,
      config.personalSiteUrl ? ` href="${escapeHtml(config.personalSiteUrl)}"` : ''
    );
  }

  return out;
}
