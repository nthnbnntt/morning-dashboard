# Project State

Last updated: 2026-05-28

## Current Architecture

Morning Dashboard is now split into two deployable surfaces:

- Cloudflare Worker API in `src/index.ts`.
- Quickbase/browser dashboard assets in `public/`.

The Worker remains responsible for D1 storage, news cache refreshes, metrics, Quickbase release scraping, company news scraping, Quickbase status, and admin refreshes. The browser app is a single Quickbase code page shell that loads CSS and JavaScript from GitHub Pages.

## Active URLs

- GitHub repo: `https://github.com/nthnbnntt/morning-dashboard`
- GitHub Pages assets: `https://nthnbnntt.github.io/morning-dashboard/`
- Quickbase code page shell: `public/quickbase-dashboard.html`
- Worker API default in config: `https://morning-dashboard.n8visions.workers.dev`

If the Worker is deployed at a custom route or a different workers.dev subdomain, update `public/js/config.js`.

## Important Conventions

- Browser dashboard routing uses hash routes: `#news`, `#tickets`, `#releases`, `#company`, and `#metrics`.
- Static feature modules live under `public/js/features/`.
- Quickbase loads `public/js/dashboard.bundle.js`, which is built from `public/js/app.js` by `npm run build:assets`.
- Cloudflare endpoints stay under `/api/*`.
- Quickbase ticket reads use the browser session and temporary token flow for realm `vtg.quickbase.com`, app `br35mavda`, table `bsmpv3zg4`.
- CORS allows Quickbase, GitHub Pages, and local development origins.
- `/api/refresh-news` requires `ADMIN_WRITE_TOKEN`; an empty token disables manual refresh.

## Migration Status

- Worker-rendered dashboard pages have been replaced by a small landing page that points to the GitHub Pages dashboard shell.
- Static GitHub Pages deployment is configured through `.github/workflows/deploy-pages.yml`.
- Cloudflare deployment remains configured through `.github/workflows/deploy-cloudflare.yml`.
