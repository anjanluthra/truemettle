import { config, DEFAULTS } from './config.js';

/* public/index.html is a complete, correct page on its own — it carries real
   default URLs, not placeholders, so a static host can serve it untouched.
   This rewrites those defaults in place, and only when the environment asks
   for something different. Run at build time by tools/build.js. */

const PERSONAL_LINK_REGION = /<!--personal-link-->[\s\S]*?<!--\/personal-link-->/;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);

function personalLink() {
  const label = escapeHtml(config.personalSiteLabel);
  const inner = config.personalSiteUrl
    ? `<a href="${escapeHtml(config.personalSiteUrl)}" rel="noopener">${label}</a>`
    : `<span class="tbc">${label}</span>`;
  return `<!--personal-link-->${inner}<!--/personal-link-->`;
}

export function renderHtml(html) {
  let out = html;

  if (config.siteUrl !== DEFAULTS.siteUrl) {
    out = out.replaceAll(DEFAULTS.siteUrl, escapeHtml(config.siteUrl));
  }

  if (
    config.personalSiteUrl !== DEFAULTS.personalSiteUrl ||
    config.personalSiteLabel !== DEFAULTS.personalSiteLabel
  ) {
    out = out.replace(PERSONAL_LINK_REGION, personalLink());
  }

  return out;
}
