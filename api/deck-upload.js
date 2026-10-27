import { issueSignedToken } from '@vercel/blob';
import { handleUploadPresigned } from '@vercel/blob/client';
import { blobAuth, blobConfigured } from '../src/config.js';
import { parseBody } from '../src/http.js';

/* Deck uploads, via Vercel Blob.
 *
 * A function can't take a 20 MB body, so the browser uploads the PDF straight
 * to Blob storage; this endpoint only hands out a short-lived presigned upload
 * URL for it, and only for a PDF under 20 MB in decks/. The resulting link
 * travels with the form to /api/contact.
 *
 *   GET  /api/deck-upload   { enabled }  — the form hides the upload when false
 *   POST /api/deck-upload   the exchange @vercel/blob/client's uploadPresigned performs
 *
 * Off until the project has a Blob store (BLOB_STORE_ID or a read-write token).
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
    const result = await handleUploadPresigned({
      body,
      request: req,
      // Only checked on upload-completed callbacks, which this never asks for.
      webhookPublicKey: process.env.BLOB_WEBHOOK_PUBLIC_KEY || 'unused',
      getSignedToken: async (pathname) => {
        if (!/^decks\/[^/]+\.pdf$/i.test(pathname)) throw new Error('Only PDF decks can be uploaded.');
        const rules = { allowedContentTypes: ['application/pdf'], maximumSizeInBytes: MAX_BYTES };
        const token = await issueSignedToken({ ...blobAuth(req), ...rules, pathname, operations: ['put'], validUntil: Date.now() + 15 * 60_000 });
        return { token, urlOptions: { ...rules, addRandomSuffix: true } };
      }
    });
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(200).send(JSON.stringify(result));
  } catch (error) {
    console.error('[deck-upload]', error.message);
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(400).send(JSON.stringify({ error: error.message }));
  }
}
