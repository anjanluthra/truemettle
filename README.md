# True Mettle

A one-page holding site for True Mettle, built to stand in while the brand
identity is designed. No logo, no photography — it works on type, space and
colour, with a marked slot where the hero image will go.

Expected life: 8–12 weeks.

Deploys to **Vercel**, which this repository is already connected to.

---

## The stack, and why

The repository was empty, so nothing had to be inherited. The page is static;
the only thing needing a server is the contact form, which has to email you
*and* keep a private copy. That's one serverless function.

| Piece | Choice | Why |
| --- | --- | --- |
| Page | Hand-written HTML, CSS and ~5 KB of JS | No framework, no build to relearn in eight weeks |
| Hosting | Vercel, serving `public/` statically | Already wired to the repo; deploys on push |
| Form | One serverless function, `api/contact.js` | The only server-side code in the project |
| Storage | TiDB via `mysql2` | Vercel has no disk; a hosted table is the equivalent |
| Email | `nodemailer` over SMTP | Provider-agnostic |
| Type | Fraunces + Work Sans, self-hosted | No Google Fonts request, no third party watching visitors |

Five requests, ~129 KB total on a cold load, most of it the two fonts. Vercel
compresses everything at the edge.

---

## Running it locally

```bash
npm install
cp .env.example .env     # optional
npm run dev              # http://localhost:3000
```

`dev-server.js` stands in for Vercel: it serves `public/` and routes
`/api/contact` to the same function, so the whole page works without the
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
| `PERSONAL_SITE_URL` | `https://anjanluthra.com` | **TBC.** Leave *empty* and the label renders as plain text instead of a link |
| `PERSONAL_SITE_LABEL` | `anjanluthra.com` | The visible text |
| `CONTACT_SUBJECT_PREFIX` | `True Mettle` | Subject line prefix |
| `RATE_LIMIT_MAX` | `5` | Submissions per IP per window |
| `RATE_LIMIT_WINDOW_MINUTES` | `60` | |
| `PORT` | `3000` | Local preview only |

---

## Reading the enquiries

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

---

## Adding the hero image

1. Drop the file in `public/` as `hero.jpg` (or `.webp`). Roughly 1600 × 700
   or wider; anything landscape-ish crops cleanly.
2. In `public/index.html`, find the block marked `HERO IMAGE SLOT` and replace
   the entire `<figure class="hero__plate">…</figure>` with:

   ```html
   <img class="hero__plate" src="/hero.jpg" width="1600" height="700"
        alt="" decoding="async" fetchpriority="high">
   ```

Until then the slot is a green plate carrying a line of the copy as a pull
quote, so the fold reads as a finished page rather than an empty frame. The
slot crops with `object-fit: cover` — 16:6.5 on a desktop, 4:5 on a phone — so
one photograph serves both.

## Replacing the mark and the link preview

- `public/favicon.svg` — a typographic "TM" placeholder, hand-editable.
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

1. A honeypot field (`company_website`) positioned off-screen.
2. A timing check — a form completed in under 2.5 seconds isn't being read.
   No upper bound on purpose: someone who opens the page, gets pulled away and
   sends it the next morning is exactly who this is for.
3. Rate limiting, five submissions per IP per hour, counted in TiDB. The
   count is taken before the insert, so a flood can't fill the table with the
   rows it was rejected for.

Anything caught gets the ordinary thank-you page, so a bot learns nothing —
but it is **stored with `spam = true` rather than thrown away**, and never
emailed. A real person caught by a filter is still recoverable.

---

## Decisions still open

1. **SMTP provider.** No account exists yet. Postmark or Resend for a site
   this size; a Google Workspace app password also works.
2. **Domain.** `SITE_URL` is a placeholder until the domain is confirmed; it
   affects link previews only.
3. **`anjanluthra.com`.** Marked TBC in the brief — the link is live and
   configurable. Set `PERSONAL_SITE_URL=` (empty) to show it as plain text
   until the site exists.

## Deliberately not here

Logo, photography, extra pages, CMS, newsletter, social links, portfolio,
testimonials, analytics, cookie banner.
