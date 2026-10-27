# True Mettle

The True Mettle one-page site, built from the Figma file
**True Mettle Website** (frame `TRUE METTLE`, 1440 wide). Sizes are fluid and
top out at the design's own pixel values at 1440; below that it reflows for
tablet and phone.

Deploys to **Vercel**, which this repository is already connected to.

---

## The stack, and why

The page is static. The server side is three small serverless functions:
the deck form (emails you *and* keeps a private copy), newsletter sign-ups,
and a password-protected admin page to read both.

| Piece | Choice | Why |
| --- | --- | --- |
| Page | Hand-written HTML, CSS and ~8 KB of JS | No framework, no build step to relearn |
| Hosting | Vercel, serving `public/` statically | Already wired to the repo; deploys on push |
| Functions | `api/contact.js`, `api/subscribe.js`, `api/admin.js` | The only server-side code in the project |
| Storage | TiDB via `mysql2` | Vercel has no disk; a hosted table is the equivalent |
| Email | `nodemailer` over SMTP | Provider-agnostic |
| Type | Nanum Myeongjo + Work Sans, self-hosted latin subsets | No Google Fonts request, no third party watching visitors |
| Images | Responsive AVIF + WebP from `tools/make-photos.py` | Sized per screen; everything below the fold lazy-loads |

---

## Running it locally

```bash
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:3000
```

`dev-server.js` stands in for Vercel: it serves `public/` and routes
`/api/*` (and `/admin`) to the same functions, so the whole page works without the
Vercel CLI. It is a preview tool, not a deployment target — production is
Vercel, and only Vercel.

With nothing configured the form answers **503** and says so, rather than
showing a thank-you for an enquiry nobody will read.

---

## Going live

### 1. Attach a database

Create a cluster in [TiDB Cloud](https://tidbcloud.com) (the serverless tier is
free at this volume) and a database called `truemettle`. Its **Connect** dialog
gives you either a connection string or the parts separately.

Set **one** of these in the Vercel project's Environment Variables:

```
DATABASE_URL=mysql://prefix.user:password@gateway01.<region>.prod.aws.tidbcloud.com:4000/truemettle
```

or `TIDB_HOST`, `TIDB_PORT`, `TIDB_USER`, `TIDB_PASSWORD`, `TIDB_DATABASE`.

TLS is on by default and TiDB Cloud presents a publicly trusted certificate, so
there is no CA file to upload. `TIDB_SSL=false` exists only for a local MySQL.

Then, once:

```bash
npm run db:init        # creates the submissions table and proves it's reachable
```

The function also creates the table lazily on the first enquiry, so this is
really a way to find out about a bad connection string before a founder does.

### 2. Add the SMTP settings

Set these in the Vercel project's **Environment Variables**:

| Variable | Example |
| --- | --- |
| `CONTACT_EMAIL_TO` | `anjan@truemettle.com` |
| `CONTACT_EMAIL_FROM` | `True Mettle <site@truemettle.com>` — must be a sender your provider allows |
| `SMTP_HOST` | `smtp.postmarkapp.com` |
| `SMTP_PORT` | `587` (`465` for implicit TLS) |
| `SMTP_SECURE` | `false` — defaults to `true` on port 465 |
| `SMTP_USER` / `SMTP_PASS` | blank for an unauthenticated relay |

Replies go to the sender's own address, so hitting reply in your mail client
answers the founder directly.

### 3. Push

Every push to the branch deploys. `vercel.json` sets the security headers and
the cache policy; `npm run build` runs on each deploy and rewrites the page's
URLs only if `SITE_URL` or the personal-site variables differ from the
defaults baked into the HTML.

### Everything else

| Variable | Default | Notes |
| --- | --- | --- |
| `SITE_URL` | `https://truemettle.com` | Canonical and Open Graph tags. Applied at build time |
| `PERSONAL_SITE_URL` | `https://anjanluthra.com` | Every "Anjan Luthra" / "Anjan's story" link. Leave *empty* to render them as plain text |
| `ADMIN_PASSWORD` | — | Turns on `/admin`. Unset, the page 404s |
| `BLOB_READ_WRITE_TOKEN` | — | Turns on deck uploads (PDF, up to 20MB). Added automatically when you connect a Vercel Blob store |
| `CONTACT_SUBJECT_PREFIX` | `True Mettle` | Subject line prefix |
| `RATE_LIMIT_MAX` | `5` | Submissions per IP per window |
| `RATE_LIMIT_WINDOW_MINUTES` | `60` | |
| `PORT` | `3000` | Local preview only |

---

## The "Send your deck" flow

Every "send your deck" link opens a dialog: *Where do you want to start?*
then **Pitch True Mettle** (about you → your business → your deck), **Grow
with Indexed** (a link out), or **Press & speaking** (about you → the request
→ the details). Both routes post to `/api/contact` with `kind` set to `pitch`
or `press`; the route-specific answers are stored as JSON in `details`.

Decks upload straight from the browser to Vercel Blob (a function can't take
a 20MB body); `/api/deck-upload` only issues the one-time token. Uploads stay
hidden until `BLOB_READ_WRITE_TOKEN` is set. Blob links are public but
unguessable, and only the admin page and the notification email show them.

## Reading enquiries and sign-ups

### The admin page

Set `ADMIN_PASSWORD` in Vercel, then open **`/admin`** — any username, that
password. It lists every deck submission and newsletter sign-up, newest first,
with a **Download CSV** link for each (the CSV opens cleanly in Excel or
Google Sheets, and can be imported straight into a mail tool). Spam-flagged
rows are greyed out and left out of the counts.

### Straight from the database

From TiDB Cloud's SQL Editor, or any MySQL client:

```sql
SELECT received_at, name, email, business, revenue, situation
FROM submissions
WHERE spam = 0
ORDER BY id DESC;
```

`emailed` and `email_error` record whether the notification actually went out,
so a silent SMTP failure is visible rather than invisible. `spam = true` marks
a submission the filters caught — worth a glance now and then in case
something genuine landed there.

Enquiries are written to TiDB **before** the email is attempted, so a bad SMTP
password can never lose one.

Newsletter sign-ups live in `subscribers` (one row per address — signing up
twice is harmless). They are stored, not emailed; nothing sends the newsletter
itself yet, so export the CSV into whatever tool sends "Fifth".

```sql
SELECT subscribed_at, email FROM subscribers WHERE spam = 0 ORDER BY id DESC;
```

---

## Updating the images

Photos ship as responsive AVIF + WebP in `public/img/` (`<name>-<width>.avif`),
up to 2880 px wide for full-bleed images, so Retina and phone screens get
sharp files and nobody downloads more than their screen needs. They are
generated by one script from sources in `photos/` (gitignored — originals are
large; only the outputs are committed):

```bash
python3 tools/make-photos.py           # all of them (needs Pillow >= 11.3)
python3 tools/make-photos.py founder   # just one
```

Each entry in `tools/make-photos.py` names its source file, the crop that
reproduces the Figma frame, and the widths to emit. The script never upscales,
and it rewrites the `srcset`s in `public/index.html` itself.

**Current sources:** the closing portrait (`founder`) is cut from the 2731×4096
original. The rest are still the 1× exports from Figma, so they top out at
1440 px — to sharpen one, put its original in `photos/`, point its entry at
it (adjusting the crop if the Figma frame cropped it), and re-run the script.
The wordmark, monogram and arrows are SVGs and are sharp at any size.

## Replacing the mark and the link preview

- `public/favicon.svg` — still the typographic "TM" placeholder, hand-editable.
- `tools/og-template.html` and `tools/icon-template.html` — the sources for
  `public/og.png` (the link preview card) and the touch icons.

```bash
npm run images   # re-renders og.png, apple-touch-icon.png and icon-32.png
```

Needs Chrome or Chromium locally; set `CHROME=/path/to/chrome` if it isn't
found. Not part of the deploy.

---

## Spam handling

No CAPTCHA. Three quiet layers instead:

1. A honeypot field (`company_website`) positioned off-screen — on both the
   deck form and the newsletter form.
2. A timing check — a form completed in under 2.5 seconds isn't being read.
   No upper bound on purpose: someone who opens the page, gets pulled away and
   sends it the next morning is exactly who this is for.
3. Rate limiting, five per IP per hour (for each form), counted in TiDB. The
   count is taken before the insert, so a flood can't fill the table with the
   rows it was rejected for.

Anything caught gets the ordinary thank-you page, so a bot learns nothing —
but it is **stored with `spam = true` rather than thrown away**, and never
emailed. A real person caught by a filter is still recoverable.

---

## Decisions still open

1. **SMTP provider.** Postmark or Resend for a site this size; a Google
   Workspace app password also works.
2. **Domain.** `SITE_URL` is a placeholder until the domain is confirmed; it
   affects link previews only.
3. **Copy the design doesn't have yet** — all marked `TBC` in
   `public/index.html`:
   - The FAQ answers. Drafted from the copy elsewhere on the page.
   - Social profile URLs (X, TikTok, Instagram, LinkedIn, YouTube) — shown as
     plain text until there are links.
   - Privacy and cookie policy pages. "Cookie settings" was dropped: the site
     sets no cookies.
4. **Sending the newsletter.** Sign-ups are collected; picking the tool that
   sends "Fifth" (and importing the CSV) is still to do.
5. **Brand fonts.** The nav in the design is Inter; it is set in Work Sans
   here to save a font download.
