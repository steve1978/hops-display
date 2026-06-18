# 🍺 On Tap — Pub Beer Display

A 4-tap pub display screen with a staff console that pulls beer info from
[Untappd](https://untappd.com/) **on demand** (no mass scraping).

- **Front end** — `index.html`, hosted free on **GitHub Pages**. A 2×2 grid of
  taps (logo, brewery, name, style, ABV, rating, description) that auto-refreshes
  every 30 s. Staff-login button in the top corner.
- **Back end** — a single **Cloudflare Worker** (free tier) that scrapes Untappd
  when you hit *Search*, and stores the chosen 4 beers in **Cloudflare KV** so any
  device (the pub TV) sees the same layout.

```
┌─ GitHub Pages (static) ─┐        ┌─ Cloudflare Worker (free) ─┐
│  index.html  (display)  │  HTTPS │  /api/search  → Untappd     │
│  admin.html  (console)  │ ─────► │  /api/beer    → Untappd     │
│  css / js               │        │  /api/beers   ↔ KV store    │
└─────────────────────────┘        │  /api/login   (staff auth)  │
                                    └────────────────────────────┘
```

---

## 1. Deploy the back end (Cloudflare Worker)

You need a free [Cloudflare account](https://dash.cloudflare.com/sign-up).

```bash
cd worker
npm install
npx wrangler login                       # opens browser to authorise

# create the KV store and copy the printed id into wrangler.toml
npx wrangler kv namespace create BEERS

# set your staff login + a random session secret
npx wrangler secret put ADMIN_USER       # e.g. landlord
npx wrangler secret put ADMIN_PASS       # e.g. a strong password
npx wrangler secret put SESSION_SECRET   # any long random string

npx wrangler deploy
```

Wrangler prints a URL like `https://hops-display.YOURNAME.workers.dev`.
**Copy it.**

> Edit `wrangler.toml`: paste the KV `id`, and (for production) set
> `ALLOW_ORIGIN` to your GitHub Pages origin, e.g. `https://YOURNAME.github.io`.

## 2. Point the front end at your Worker

Open `js/config.js` and set:

```js
API_BASE: "https://hops-display.YOURNAME.workers.dev",
```

## 3. Publish the front end (GitHub Pages)

1. Create a GitHub repo and push every file **except** the `worker/` folder
   (the front end is just the static files at the repo root).
2. Repo **Settings → Pages → Build and deployment**: Source = *Deploy from a
   branch*, Branch = `main`, folder = `/ (root)`. Save.
3. Your screen is live at `https://YOURNAME.github.io/REPO/`.
   - **Display (the TV):** `…/index.html`
   - **Staff console:** `…/admin.html`

## 4. Use it

1. Open **admin.html**, log in with the username/password you set.
2. Type e.g. `weetwood turncoat`, hit **Search**, pick the right result.
   The Worker scrapes the logo, name, style, ABV, rating and description.
3. Assign beers to taps 1–4, then **Publish to screen**.
4. The TV running **index.html** updates within 30 s.

---

## Local testing

```bash
cd worker && npx wrangler dev          # backend on http://localhost:8787
# set js/config.js API_BASE to http://localhost:8787, then open index.html
```

## AI description rewrites (optional)

When a staff member picks a beer, the Worker can rewrite Untappd's blurb in the
pub's own dry, Cheshire voice via a **free OpenRouter model**. The original text
is kept, and the rewrite is editable + regenerable in the console before you
publish. To enable it:

```bash
cd worker
npx wrangler secret put OPENROUTER_API_KEY    # paste your OpenRouter key
npx wrangler deploy
```

- The key lives only as a Cloudflare secret — never in the repo or the browser.
- The rewrite endpoint is auth-gated (staff login required) so the key can't be
  abused publicly.
- Default model: `openai/gpt-4o-mini` — cheap and reliable (a rewrite costs a
  tiny fraction of a penny; you need a small credit balance on OpenRouter).
  Override by adding `OPENROUTER_MODEL = "…"` under `[vars]` in `wrangler.toml`
  (e.g. `openai/gpt-4.1-nano` for an even cheaper option).
- If a rewrite fails (rate limit, no credit, etc.) the console keeps the
  existing text and tells you exactly why — nothing breaks.

## Notes & limits

- **On-demand only.** Untappd is fetched just when a staff member searches or
  picks a beer — never in bulk. Keep it courteous; it's their data.
- Untappd can change their HTML. Parsing lives in `worker/src/worker.js`
  (`searchUntappd` / `scrapeBeer`) and uses Open Graph tags as a stable fallback.
- Cloudflare's free tier (100k requests/day) is far more than a pub needs.
- Auth is a simple shared username/password suitable for back-of-house use,
  not a public sign-up system.
