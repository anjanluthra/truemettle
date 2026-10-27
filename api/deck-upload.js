import { handleUpload } from '@vercel/blob/client';
import { blobConfigured } from '../src/config.js';
import { parseBody } from '../src/http.js';

/* Deck uploads, via Vercel Blob.
 *
 * A function can't take a 20 MB body, so the browser uploads the PDF straight
 * to Blob storage; this endpoint only hands out a one-time token for it, and
 * only for a PDF under 20 MB in decks/. The resulting link travels with the
 * form to /api/contact.
 *
 *   GET  /api/deck-upload   { enabled }  — the form hides the upload when false
 *   POST /api/deck-upload   the token exchange @vercel/blob/client performs
 *
 * Off until the project has a Blob store (BLOB_READ_WRITE_TOKEN).
 */

const MAX_BYTES = 20 * 1024 * 1024;

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify({ enabled: blobConfigured }));
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    res.status(405).send('Method not allowed');
    return;
  }

  if (!blobConfigured) {
    res.status(503).send(JSON.stringify({ error: 'uploads_not_configured' }));
    return;
  }

  try {
    const body = await parseBody(req);
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (pathname) => {
        if (!/^decks\/[^/]+\.pdf$/i.test(pathname)) throw new Error('Only PDF decks can be uploaded.');
        return {
          allowedContentTypes: ['application/pdf'],
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true
        };
      },
      // The link is saved with the enquiry itself, so nothing to do here.
      onUploadCompleted: async () => {}
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify(result));
  } catch (error) {
    console.error('[deck-upload]', error.message);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(400).send(JSON.stringify({ error: error.message }));
  }
}
