# True Mettle

A one-page holding site for True Mettle, built to stand in while the brand
identity is designed. No logo, no photography — it works on type, space and
colour, with a marked slot where the hero image will go.

Expected life: 8–12 weeks.

---

## The stack, and why

The repository was empty, so nothing had to be inherited. The form has to send
an email *and* keep a private copy, which means a server — but nothing beyond
that is needed, so there isn't any:

| Piece | Choice | Why |
| --- | --- | --- |
| Page | Hand-written HTML, CSS and ~5 KB of JS | No build step, nothing to upgrade, nothing to relearn in eight weeks |
| Server | Node's built-in `http` (~330 lines) | Serves the page, handles the form, and that's it |
| Storage | SQLite via Node 22's built-in `node:sqlite` | A real table, zero dependencies, one file to back up |
| Email | `nodemailer` over SMTP | The only dependency in the project. Works with any provider |
| Type | Fraunces + Work Sans, self-hosted | No Google Fonts request, no third party watching visitors |

Assets are read, brotli-compressed and cached in memory at boot. The page comes
down as roughly **2.7 KB of HTML** plus 117 KB of fonts.

**Requires Node 22.5 or newer** — that's when `node:sqlite` landed. `node -v`
to check.

---

## Running it locally

```bash
npm install
cp .env.example .env     # optional: nothing here is required to run
npm run dev              # http://localhost:3000, restarts on save
```

Without SMTP configured the form still works end to end: submissions are
stored, and the email that *would* have been sent is printed to the console.

`npm start` runs it without the file watcher.

---

## Environment variables

Everything has a working default except the email settings. Copy
`.env.example` to `.env`, or set them in your host's dashboard.

### Needed before the form can email you

| Variable | Example | Notes |
| --- | --- | --- |
| `CONTACT_EMAIL_TO` | `anjan@truemettle.com` | Where enquiries land |
| `CONTACT_EMAIL_FROM` | `True Mettle <site@truemettle.com>` | Must be a sender your SMTP provider allows |
| `SMTP_HOST` | `smtp.postmarkapp.com` | |
| `SMTP_PORT` | `587` | `465` if using implicit TLS |
| `SMTP_SECURE` | `false` | Defaults to `true` when the port is 465 |
| `SMTP_USER` / `SMTP_PASS` | | Leave blank for an unauthenticated relay |

Replies go to the sender's own address, so hitting reply in your mail client
answers the founder directly.

### Everything else

| Variable | Default | Notes |
| --- | --- | --- |
| `SITE_URL` | `https://truemettle.com` | Canonical and Open Graph tags only |
| `PORT` / `HOST` | `3000` / `0.0.0.0` | |
| `TRUST_PROXY` | `0` | Set to `1` behind a proxy so rate limiting sees real IPs |
| `PERSONAL_SITE_URL` | `https://anjanluthra.com` | **TBC.** Leave *empty* and the label renders as plain text instead of a link |
| `PERSONAL_SITE_LABEL` | `anjanluthra.com` | The visible text |
| `DATABASE_PATH` | `./data/submissions.db` | Point at a mounted volume in production |
| `OVERFLOW_LOG_PATH` | `./data/submissions.jsonl` | Only used if SQLite can't be opened |
| `CONTACT_SUBJECT_PREFIX` | `True Mettle` | Subject line prefix |
| `RATE_LIMIT_MAX` | `5` | Submissions per IP per window |
| `RATE_LIMIT_WINDOW_MS` | `3600000` | One hour |

---

## Deploying

The whole thing is one Node process plus one directory that must survive
restarts (`data/`). Any host that runs a container or a Node process will do —
Fly.io, Render, Railway, a small VPS.

### Docker (works anywhere)

```bash
docker build -t truemettle .
docker run -d --name truemettle -p 3000:3000 \
  --env-file .env \
  -v truemettle-data:/app/data \
  truemettle
```

### Plain Node host

```bash
npm ci --omit=dev
NODE_ENV=production npm start
```

Put TLS in front of it (your host's load balancer, Cloudflare, or nginx) and
set `TRUST_PROXY=1`.

> **The one thing to get right:** `data/` holds every enquiry. On a platform
> with an ephemeral filesystem, mount a volume at that path or attach a disk.
> Without one, a redeploy takes the submissions with it.

### Reading the enquiries

```bash
sqlite3 data/submissions.db \
  "SELECT received_at, name, email, business, revenue, situation
   FROM submissions WHERE spam = 0 ORDER BY id DESC;"
```

`emailed` and `email_error` on each row record whether the notification
actually went out, so a silent SMTP failure is visible rather than invisible.
`spam = 1` marks a submission the filters caught — worth a glance now and then
in case something genuine landed there.

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

3. Restart the server (assets are cached at boot).

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

Needs Chrome or Chromium; set `CHROME=/path/to/chrome` if it isn't found.

---

## Spam handling

No CAPTCHA. Three quiet layers instead:

1. A honeypot field (`company_website`) positioned off-screen.
2. A timing check — a form completed in under 2.5 seconds isn't being read.
3. Rate limiting, five submissions per IP per hour.

Anything that trips one of these gets the normal thank-you page, so a bot
learns nothing — but it is **stored with `spam = 1` rather than thrown away**,
and never emailed. A real person caught by a filter is still recoverable.

The timing check has no upper bound on purpose: someone who opens the page,
gets pulled away and sends it the next morning is exactly who this is for.

---

## Decisions still open

1. **Hosting.** The build assumes a Node process with a persistent `data/`
   directory. If you'd rather deploy to Vercel or Netlify, the page itself is
   already static but the form needs rewriting against a hosted database
   (Neon, Turso) — say the word and it's a small change.
2. **SMTP provider.** No account exists yet. Postmark or Resend for a site
   this size; a Google Workspace app password also works.
3. **`anjanluthra.com`.** Marked TBC in the brief — the link is live and
   configurable. Set `PERSONAL_SITE_URL=` (empty) to show it as plain text
   until the site exists.
4. **Domain.** `SITE_URL` is a placeholder until the domain is confirmed; it
   only affects link previews.
5. **Currency.** The brief says "$50,000" and the footer says Dubai — left as
   written, but worth deciding whether that reads as USD or AED to a UAE
   founder.

## Deliberately not here

Logo, photography, extra pages, CMS, newsletter, social links, portfolio,
testimonials, analytics, cookie banner.
