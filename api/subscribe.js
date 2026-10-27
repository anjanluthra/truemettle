import { storeConfigured } from '../src/config.js';
import { saveSubscriber } from '../src/store.js';
import { resultPage } from '../src/contact.js';
import { parseBody, wantsJson, clientIp, reply } from '../src/http.js';

/* POST /api/subscribe — newsletter ("Fifth") sign-ups, stored in TiDB.
 *
 * JSON for the page's fetch; a plain result page for a browser posting the
 * footer form without JavaScript.
 */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const page = (heading, body) =>
  resultPage({ title: heading, heading, body, action: '<a href="/">Back to True Mettle</a>' });

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method not allowed');
    return;
  }

  const json = wantsJson(req);

  if (!storeConfigured) {
    console.error('[subscribe] refused: no DATABASE_URL configured');
    const message = 'Sign-ups aren’t connected yet. Please try again shortly.';
    return reply(res, json, 503, {
      payload: { ok: false, message },
      html: page('Not signed up', message)
    });
  }

  let values;
  try {
    values = await parseBody(req);
  } catch (error) {
    return reply(res, json, error.statusCode || 400, {
      payload: { ok: false, message: 'Bad request.' },
      html: page('Not signed up', 'Bad request.')
    });
  }

  const email = (typeof values.email === 'string' ? values.email.trim() : '').slice(0, 200);
  if (!EMAIL.test(email)) {
    const message = 'That email address doesn’t look right.';
    return reply(res, json, 422, {
      payload: { ok: false, message },
      html: page('Not signed up', `${message} Press back and try again.`)
    });
  }

  // A filled honeypot is stored flagged and answered like anyone else.
  const spam = typeof values.company_website === 'string' && values.company_website.trim() !== '';

  try {
    const result = await saveSubscriber({
      email,
      spam,
      ip: clientIp(req),
      userAgent: String(req.headers['user-agent'] || '').slice(0, 300)
    });
    if (result.rateLimited) {
      const message = 'That’s a few sign-ups in a short space of time — try again later.';
      return reply(res, json, 429, {
        payload: { ok: false, message },
        html: page('Not signed up', message)
      });
    }
  } catch (error) {
    console.error('[subscribe] could not store sign-up:', error);
    const message = 'Something went wrong at our end. Please try again.';
    return reply(res, json, 500, {
      payload: { ok: false, message },
      html: page('Not signed up', message)
    });
  }

  return reply(res, json, 200, {
    payload: { ok: true },
    html: page('You’re in.', 'The next essay will land in your inbox.')
  });
}
