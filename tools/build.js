import fs from 'node:fs';
import path from 'node:path';
import { ROOT, config, DEFAULTS } from '../src/config.js';
import { renderHtml } from '../src/render.js';

/* Vercel's build step. The page ships as static HTML carrying real defaults,
   so this does nothing at all unless SITE_URL or the personal-site variables
   ask for something different — in which case it rewrites them in place
   before the static host picks the file up. */

const file = path.join(ROOT, 'public', 'index.html');
const before = fs.readFileSync(file, 'utf8');
const after = renderHtml(before);

if (before === after) {
  console.log('build: public/index.html already matches the environment — nothing to do');
} else {
  fs.writeFileSync(file, after);
  console.log('build: rewrote public/index.html');
  if (config.siteUrl !== DEFAULTS.siteUrl) console.log(`  site url      → ${config.siteUrl}`);
  if (config.personalSiteUrl !== DEFAULTS.personalSiteUrl) {
    console.log(`  personal link → ${config.personalSiteUrl || '(plain text)'}`);
  }
}
