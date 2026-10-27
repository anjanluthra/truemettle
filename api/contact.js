import { mailConfigured, storeConfigured } from '../src/config.js';
import { saveSubmission, recordEmailResult } from '../src/store.js';
import { sendNotification, sendConfirmation } from '../src/mail.js';
import {
  validateSubmission,
  looksAutomated,
  successPage,
  errorPage
} from '../src/contact.js';
import { parseBody, wantsJson, clientIp, reply } from '../src/http.js';

/* POST /api/contact — a Vercel serverless function.
 *
 * Answers JSON to the page's fetch, and a styled HTML page to a browser
 * posting the form with JavaScript unavailable.
 */

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).send('Method not allowed');
    return;
  }

  const json = wantsJson(req);

  // Nothing configured means nobody would ever read this. Say so rather than
  // showing a thank-you for an enquiry that goes nowhere.
  if (!storeConfigured && !mailConfigured) {
    const message =
      'The contact form isn’t connected yet. Please try again shortly, or email me directly.';
    console.error('[contact] refused: neither DATABASE_URL nor RESEND_API_KEY is configured');
    return reply(res, json, 503, {
      payload: { ok: false, message },
      html: errorPage({ unconfigured: message })
    });
  }

  let values;
  try {
    values = await parseBody(req);
  } catch (error) {
    const message = 'That message was too long to accept.';
    return reply(res, json, error.statusCode || 400, {
      payload: { ok: false, message },
      html: errorPage({ body: message })
    });
  }

  const { clean, errors, valid } = validateSubmission(values);

  // Anything tripping the spam checks is stored flagged and never emailed —
  // a bot gets the ordinary thank-you and learns nothing, and the rare false
  // positive is still sitting in the table rather than gone.
  const spam = looksAutomated(values);

  if (!spam && !valid) {
    return reply(res, json, 422, { payload: { ok: false, errors }, html: errorPage(errors) });
  }

  const submission = {
    ...clean,
    spam,
    ip: clientIp(req),
    userAgent: String(req.headers['user-agent'] || '').slice(0, 300)
  };

  let id = null;

  if (storeConfigured) {
    try {
      const result = await saveSubmission(submission);

      if (result.rateLimited) {
        const message =
          'That’s a few messages in a short space of time — try again a little later.';
        return reply(res, json, 429, {
          payload: { ok: false, message },
          html: errorPage({ rate: message })
        });
      }

      id = result.id;
    } catch (error) {
      console.error('[contact] could not persist submission:', error);
      const message = 'Something went wrong at my end — nothing was sent. Please try again.';
      return reply(res, json, 500, {
        payload: { ok: false, message },
        html: errorPage({ server: message })
      });
    }
  } else {
    // The inbox is the record until the database is provisioned. Still durable,
    // so the enquiry is not at risk — but worth shouting about in the logs.
    console.warn('[contact] no DATABASE_URL — relying on the notification email alone');
  }

  // Stored safely, so the notification can be awaited without holding the
  // reply hostage to Resend: a serverless function stops executing once it
  // responds, so this has to finish first.
  if (spam) {
    console.info('[contact] #%s flagged as automated — stored, not emailed', id ?? '—');
  } else {
    const result = await sendNotification(submission);
    await recordEmailResult(id, result.ok, result.error);
    // The branded "received" email to them; its outcome is only logged.
    await sendConfirmation(submission);
    console.info(
      '[contact] #%s from %s — email %s',
      id ?? '—',
      submission.email,
      result.ok ? 'sent' : `not sent (${result.error})`
    );

    // With no database, a failed email means the enquiry is genuinely lost.
    if (!result.ok && !storeConfigured) {
      const message =
        'Something went wrong sending that — please try again, or email me directly.';
      return reply(res, json, 502, {
        payload: { ok: false, message },
        html: errorPage({ mail: message })
      });
    }
  }

  return reply(res, json, 200, { payload: { ok: true }, html: successPage() });
}
