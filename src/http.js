/* Request plumbing shared by the functions in api/. */

const MAX_BODY_BYTES = 64 * 1024;

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('body too large'), { statusCode: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// A form post repeats a key once per ticked checkbox; keep those as arrays.
function formFields(raw) {
  const fields = {};
  for (const [key, value] of new URLSearchParams(raw)) {
    if (key in fields) fields[key] = [].concat(fields[key], value);
    else fields[key] = value;
  }
  return fields;
}

export async function parseBody(req) {
  // Vercel parses JSON and form bodies for us; fall back for anything it didn't.
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    return req.headers['content-type']?.includes('json') ? safeJson(req.body) : formFields(req.body);
  }

  const raw = await readRawBody(req);
  return req.headers['content-type']?.includes('json') ? safeJson(raw) : formFields(raw);
}

function safeJson(raw) {
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export const wantsJson = (req) =>
  String(req.headers.accept || '').includes('application/json') ||
  String(req.headers['content-type'] || '').includes('application/json');

// Vercel terminates TLS and sets this itself, so the left-most entry is real.
export const clientIp = (req) =>
  String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || '')
    .split(',')[0]
    .trim();

export function reply(res, json, status, { payload, html }) {
  res.setHeader('Cache-Control', 'no-store');
  if (json) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(status).send(JSON.stringify(payload));
    return;
  }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.status(status).send(html);
}
