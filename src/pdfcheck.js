import zlib from 'node:zlib';

/* A safety check on an uploaded deck before it reaches the admin's browser.
 *
 * Not a virus scanner: it looks for the PDF features that malicious PDFs rely
 * on and an ordinary pitch deck never needs (scripts, launching programs,
 * embedded files, forms that post data, Flash). It reads the raw file, undoes
 * #xx escapes in names, and inflates compressed streams, where these
 * keys are usually hidden. Image streams are skipped. */

const RISKS = [
  { key: /\/(JavaScript|JS)\b/, label: 'runs JavaScript' },
  { key: /\/Launch\b/, label: 'can launch a program or file on your computer' },
  { key: /\/(EmbeddedFiles?|FileAttachment)\b/, label: 'has files hidden inside it' },
  { key: /\/RichMedia\b/, label: 'contains Flash or other embedded media' },
  { key: /\/XFA\b/, label: 'contains an XFA form, which can carry scripts' },
  { key: /\/(SubmitForm|ImportData)\b/, label: 'can send or load data over the internet' },
  { key: /\/GoToE\b/, label: 'links into an embedded document' }
];

const MAX_STREAMS = 5000;
const MAX_INFLATED = 20 * 1024 * 1024; // per stream
const MAX_TOTAL = 100 * 1024 * 1024;

const decodeNames = (text) => text.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));

function* streams(text) {
  let at = 0;
  for (let n = 0; n < MAX_STREAMS; n++) {
    const start = text.indexOf('stream', at);
    if (start === -1) return;
    at = start + 6;
    // "endstream" contains "stream"; only a keyword that starts a line of data counts.
    if (text.startsWith('end', start - 3)) continue;
    let body = at;
    if (text[body] === '\r') body++;
    if (text[body] !== '\n') continue;
    body++;
    const end = text.indexOf('endstream', body);
    if (end === -1) return;
    const dict = text.slice(Math.max(0, start - 600), start);
    yield { dict, from: body, to: end };
    at = end + 9;
  }
}

/** → { isPdf, encrypted, risks: [label…] } */
export function inspectPdf(buffer) {
  const head = buffer.subarray(0, 1024).toString('latin1');
  if (!head.includes('%PDF-')) return { isPdf: false, encrypted: false, risks: [] };

  const raw = buffer.toString('latin1');
  const found = new Set();
  const scan = (text) => {
    const plain = decodeNames(text);
    for (const r of RISKS) if (r.key.test(plain)) found.add(r.label);
  };
  scan(raw);

  let total = 0;
  for (const { dict, from, to } of streams(raw)) {
    if (/\/Subtype\s*\/Image/.test(dict) || !/\/FlateDecode/.test(dict)) continue;
    if (total > MAX_TOTAL) break;
    try {
      const out = zlib.inflateSync(buffer.subarray(from, to), { maxOutputLength: MAX_INFLATED });
      total += out.length;
      scan(out.toString('latin1'));
    } catch {
      // Not deflate, truncated or too large: nothing readable to check.
    }
  }

  return { isPdf: true, encrypted: /\/Encrypt\b/.test(decodeNames(raw)), risks: [...found] };
}
