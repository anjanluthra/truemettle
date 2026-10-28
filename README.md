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
| Storage | Postgres (Vercel Storage → Neon) via `pg`, or TiDB/MySQL via `mysql2` | Vercel has no disk; a hosted table is the equivalent. The connection string picks the driver |
| Email | Resend (HTTP API) | Same setup as anjanluthra.com |
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

**The simple way, all in Vercel:** in the project, open **Storage → Create
Database → Neon (Postgres)**, pick the free plan and connect it to this
project. Vercel adds `DATABASE_URL` (a `postgres://…` string) for you, and the
tables are created on the first enquiry. Nothing else to set.

**Or TiDB:** create a cluster in [TiDB Cloud](https://tidbcloud.com) (the
serverless tier is free at this volume) and a database called `truemettle`. Its
**Connect** dialog gives you either a connection string or the parts separately.

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

### 2. Turn on email (Resend)

As on anjanluthra.com, every enquiry and Fifth sign-up sends two emails: a
plain alert to the team, and a branded confirmation to the person who wrote in
(`src/emails.js`, images in `public/email/`). Set these in the Vercel project's
**Environment Variables**:

| Variable | Value |
| --- | --- |
| `RESEND_API_KEY` | from Resend → API Keys. Email is off until it's set |
| `NOTIFY_FROM` | default `True Mettle <admin@truemettle.co>`. Must be on a domain verified in Resend |
| `NOTIFY_EMAIL` | default `anjan@joindeployed.com`; comma-separate for more than one |
| `REPLY_TO` | default `anjan@joindeployed.com`: where replies to confirmations go |

Replies to an alert go to the founder's own address, so hitting reply answers
them directly. A repeat Fifth sign-up gets nothing; spam gets nothing.

### 3. Push

Every push to the branch deploys. `vercel.json` sets the security headers and
the cache policy; `npm run build` runs on each deploy and rewrites the page's
URLs only if `SITE_URL` or the personal-site variables differ from the
defaults baked into the HTML.

### Everything else

| Variable | Default | Notes |
| --- | --- | --- |
| `SITE_URL` | `https://www.truemettle.co` | Canonical and Open Graph tags. Applied at build time |
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
hidden until `BLOB_READ_WRITE_TOKEN` is set. The store is **private**: a deck
can't be opened from its Blob URL, so the admin page and the notification
email link to `/admin?deck=…`, which streams it behind the admin password.
The browser bundle (`public/vendor/blob-upload.js`) is built from
`tools/vendor/blob-upload-entry.js` with
`npx esbuild@0.24.0 tools/vendor/blob-upload-entry.js --bundle --minify --format=iife --platform=browser --target=es2019 --outfile=public/vendor/blob-upload.js`.

## Reading enquiries and sign-ups

### The admin page

Set `ADMIN_PASSWORD` in Vercel, then open **`/admin`** and sign in with that
password (no username). The sign-in lasts 14 days; **Sign out** ends it, and
changing the password signs everyone out. It lists every deck submission and newsletter sign-up, newest first,
with a **Download CSV** link for each (the CSV opens cleanly in Excel or
Google Sheets, and can be imported straight into a mail tool). Spam-flagged
rows are greyed out and left out of the counts.

### Straight from the database

From Neon's SQL Editor (Vercel → Storage → your database → Open in Neon), TiDB Cloud's SQL Editor, or any client:

```sql
SELECT received_at, name, email, business, revenue, situation
FROM submissions
WHERE NOT spam
ORDER BY id DESC;
```

`emailed` and `email_error` record whether the notification actually went out,
so a silent email failure is visible rather than invisible. `spam = true` marks
a submission the filters caught — worth a glance now and then in case
something genuine landed there.

Enquiries are written to the database **before** the email is attempted, so a
failed send can never lose one.

Newsletter sign-ups live in `subscribers` (one row per address — signing up
twice is harmless). Each new one gets the welcome email; nothing here sends the
newsletter itself, so export the CSV into Substack, which sends "Fifth".

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
  `public/opengraph-image.jpg` / `public/twitter-image.jpg` (the link preview
  card: MUSED's tagline lockup in Cream White on Light Auburn) and the touch icons.

```bash
npm run images   # re-renders the link preview card, apple-touch-icon.png and icon-32.png
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
3. Rate limiting, five per IP per hour (for each form), counted in the database. The
   count is taken before the insert, so a flood can't fill the table with the
   rows it was rejected for.

Anything caught gets the ordinary thank-you page, so a bot learns nothing —
but it is **stored with `spam = true` rather than thrown away**, and never
emailed. A real person caught by a filter is still recoverable.

---

## Decisions still open

1. **Domain.** `SITE_URL` is a placeholder until the domain is confirmed; it
   affects link previews only.
2. **Copy the design doesn't have yet** — all marked `TBC` in
   `public/index.html`:
   - The FAQ answers. Drafted from the copy elsewhere on the page.
   - Social profile URLs (X, TikTok, Instagram, LinkedIn, YouTube) — shown as
     plain text until there are links.
   - Privacy and cookie policy pages. "Cookie settings" was dropped: the site
     sets no cookies.
3. **Sending the newsletter.** Sign-ups are collected; picking the tool that
   sends "Fifth" (and importing the CSV) is still to do.
4. **Brand fonts.** The nav in the design is Inter; it is set in Work Sans
   here to save a font download.
