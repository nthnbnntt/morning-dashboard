# Project State

Last updated: 2026-05-29

## Current Architecture

Morning Dashboard is now split into two deployable surfaces:

- Cloudflare Worker API in `src/index.ts`.
- Quickbase/browser dashboard assets in `public/`.

The Worker remains responsible for D1 storage, news cache refreshes, metrics, Quickbase release scraping, company news scraping, Quickbase status, and admin refreshes. The browser app is a single Quickbase code page shell that loads CSS and JavaScript from GitHub Pages through `public/js/quickbase-loader.js`.

## Active URLs

- GitHub repo: `https://github.com/nthnbnntt/morning-dashboard`
- GitHub Pages assets: `https://nthnbnntt.github.io/morning-dashboard/`
- Quickbase code page shell: `public/quickbase-dashboard.html`
- Live Quickbase code page: `https://vtg.quickbase.com/db/br35mavda?a=dbpage&pagename=dashboard.html`
- Worker API default in config: `https://morning-dashboard.n8visions.workers.dev`

If the Worker is deployed at a custom route or a different workers.dev subdomain, update `public/js/config.js`.

## Important Conventions

- Browser dashboard routing uses hash routes: `#news`, `#tickets`, `#releases`, `#company`, and `#metrics`.
- Static feature modules live under `public/js/features/`.
- Quickbase loads `public/js/dashboard.bundle.js`, which is built from `public/js/app.js` by `npm run build:assets`.
- Quickbase itself should contain only the small shell from `public/quickbase-dashboard.html`, which loads `public/js/quickbase-loader.js` from GitHub Pages.
- `public/js/quickbase-loader.js` appends a cache-busting query string to CSS/config/bundle asset URLs so the Quickbase code page can stay unchanged while GitHub Pages updates.
- Cloudflare endpoints stay under `/api/*`.
- Quickbase ticket reads use the browser session and temporary token flow for realm `vtg.quickbase.com`, app `br35mavda`, table `bsmpv3zg4`.
- CORS allows Quickbase, GitHub Pages, and local development origins.
- `/api/refresh-news` requires `ADMIN_WRITE_TOKEN`; an empty token disables manual refresh.

## Current Browser Behavior

- News page refreshes the article feed on each page load, while shared Quickbase status and ticket summary data should reuse cached data where possible.
- News source filters are multi-select.
- The news ticket summary links into the Tickets page with `#tickets?status=...`.
- Tickets page status filters are multi-select; selecting no filters shows all loaded tickets.
- Tickets are cached for five minutes using browser memory plus `sessionStorage` when available.
- Ticket cards show app/title, status, date/type/submitter/ticket fields, then a 3-line issue preview. The ticket modal follows the same order and shows the full issue text.
- Metrics page no longer shows the Page Loads gauge or Recent Events card.

## Migration Status

- Worker-rendered dashboard pages have been replaced by a small landing page that points to the GitHub Pages dashboard shell.
- The Quickbase code page has been reduced back to a minimal loader shell so routine asset changes do not require editing the Quickbase page.
- Static GitHub Pages deployment is configured through `.github/workflows/deploy-pages.yml`.
- Cloudflare deployment remains configured through `.github/workflows/deploy-cloudflare.yml`.
